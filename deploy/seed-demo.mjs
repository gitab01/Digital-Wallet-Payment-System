/*
 * Puts demo money in the local wallet so the screens have something to show.
 *
 *   node deploy/seed-demo.mjs
 *
 * There is no payment gateway in this system: `POST /api/funds/deposit` is the funding
 * edge, so a deposit here is what "a payment arrived" looks like end to end. Everything
 * after that is the real path — the quote, the PIN check, the stepped transfer, the
 * ledger entries, the tier limits — against the API you are running.
 *
 * It makes three customers, has the review desk approve their documents so withdrawals
 * and higher limits unlock, funds them and moves money between them. Re-run it as often
 * as you like: the accounts are found again by email, and every movement carries a key
 * tied to this run, so a second run adds history rather than failing.
 *
 * The credentials below are fixtures for the local database only. They are not secrets,
 * and they must never be reused anywhere this app is actually live.
 *
 *   API_URL  API address   default http://localhost:8080
 */
import { fileScan } from './kyc-scan.mjs';

const API = (process.env.API_URL || 'http://localhost:8080').replace(/\/+$/, '');
const PASSWORD = 'Mela demo 2026';
const PIN = '4921';
const run = Date.now();

const PEOPLE = [
  { email: 'demo@wallet.local', name: 'Hanna Girma', document: 'DEMO00000HG', phone: '+251911000001', seed: 101 },
  { email: 'dawit@wallet.local', name: 'Dawit Bekele', document: 'DEMO00000DB', phone: '+251911000002', seed: 201 },
  { email: 'meron@wallet.local', name: 'Meron Tesfaye', document: 'DEMO00000MT', phone: '+251911000003', seed: 301 },
];
const REVIEWER = { email: 'ops@wallet.local', name: 'Ops Reviewer', document: 'DEMO00000OPS', phone: '+251911000009' };

const api = (method, path, { body, token } = {}) =>
  fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }).then(async (res) => {
    const text = await res.text();
    let parsed = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { status: res.status, body: parsed, text };
  });

function die(what, res) {
  console.error(`${what} failed: ${res.status} ${res.text}`);
  process.exit(1);
}

const token = (person) => person.tokens.accessToken;
const slug = (p) => p.email.split('@')[0];

/**
 * A local database that has been smoke-tested before already holds ops@wallet.local, and
 * it was created with deploy/smoke-ui.mjs's password. Neither address can be re-registered,
 * so the fixture tries both known local passwords before it gives up.
 */
const LOCAL_PASSWORDS = [PASSWORD, 'correct horse battery'];

async function signInOrRegister(p) {
  const registered = await api('POST', '/api/auth/register', {
    body: {
      email: p.email,
      fullName: p.name,
      password: PASSWORD,
      pin: PIN,
      phone: p.phone,
      dateOfBirth: '1994-02-19',
      country: 'ET',
      documentType: 'NATIONAL_ID',
      documentNumber: p.document,
    },
  });
  if (registered.status === 201) return { ...p, ...registered.body };

  for (const candidate of LOCAL_PASSWORDS) {
    const signedIn = await api('POST', '/api/auth/login', {
      body: { email: p.email, password: candidate },
    });
    if (signedIn.status === 200) {
      console.log(`  reused    ${p.email} (already on file, password ${candidate === PASSWORD ? 'this' : 'the smoke run\'s'})`);
      return { ...p, ...signedIn.body };
    }
    // A rate limit says nothing about the password, and another attempt now only
    // extends the wait.
    if (signedIn.body?.code === 'RATE_LIMITED') {
      die(`${p.email} is behind the login rate limiter — wait a minute and run this again`, signedIn);
    }
  }
  die(`signing in as ${p.email}`, {
    status: 'no known local password worked',
    text: 'This address was created by something else on this machine.',
  });
}

async function openWallet(person, currency) {
  const res = await api('POST', '/api/accounts', { token: token(person), body: { currency } });
  if (res.status >= 400 && res.status !== 409) die(`opening a ${currency} wallet for ${person.email}`, res);
}

/** A movement into a currency nobody has opened yet is a missing wallet, not a failure. */
async function intoEmptyWallet(person, currency, fn) {
  let res = await fn();
  if (res.status !== 200 && res.body?.code === 'ACCOUNT_NOT_FOUND') {
    await openWallet(person, currency);
    res = await fn();
  }
  return res;
}

async function deposit(person, currency, amount) {
  const res = await intoEmptyWallet(person, currency, () =>
    api('POST', '/api/funds/deposit', {
      token: token(person),
      body: { currency, amount, pin: PIN, idempotencyKey: `demo-dep-${run}-${slug(person)}-${currency}` },
    })
  );
  if (res.status !== 200) die(`deposit of ${amount} ${currency} for ${person.email}`, res);
  console.log(`  paid in   ${amount.padStart(9)} ${currency}  ${person.name}`);
}

async function transfer(from, toEmail, currency, amount) {
  const res = await intoEmptyWallet(from, currency, () =>
    api('POST', '/api/transfers', {
      token: token(from),
      body: {
        toEmail,
        currency,
        amount,
        pin: PIN,
        idempotencyKey: `demo-xfer-${run}-${slug(from)}-${toEmail}-${amount}`,
      },
    })
  );
  if (res.status !== 200) die(`transfer of ${amount} ${currency} from ${from.email} to ${toEmail}`, res);
  console.log(`  sent      ${amount.padStart(9)} ${currency}  ${from.name} -> ${toEmail}   ${res.body.reference}`);
}

/**
 * Both sides of the ID must be on file before a submission can be approved, and the tier
 * that allows withdrawals only arrives with that approval. On a re-run the customer is
 * already verified, so the server refuses a document with no open submission: that is the
 * expected answer, not a failure.
 */
async function verify(person) {
  try {
    await fileScan(API, token(person), 'FRONT', person.seed);
    await fileScan(API, token(person), 'BACK', person.seed + 1);
    console.log(`  filed     both sides for ${person.email}`);
  } catch (err) {
    console.log(`  ${person.email} is already verified — nothing to file`);
  }
}

async function approve(reviewer, email) {
  const queue = await api('GET', '/api/admin/kyc-queue', { token: token(reviewer) });
  if (queue.status !== 200) die('reading the review queue', queue);
  const entry = (queue.body || []).find((r) => r.email === email);
  if (!entry) {
    console.log(`  ${email}: nothing waiting on the desk, already decided`);
    return;
  }
  const decision = await api('POST', `/api/kyc/${entry.recordId}/decision`, {
    token: token(reviewer),
    body: { approve: true },
  });
  if (decision.status !== 200) die(`approving ${email}`, decision);
  console.log(`  approved  ${email}`);
}

console.log(`Seeding demo payments against ${API}`);

const people = [];
for (const p of PEOPLE) people.push(await signInOrRegister(p));
const reviewer = await signInOrRegister(REVIEWER);
const [hanna, dawit, meron] = people;

console.log('\nIdentity documents');
for (const p of people) await verify(p);

console.log('\nReview desk');
for (const p of people) await approve(reviewer, p.email);

console.log('\nDeposits');
await deposit(hanna, 'ETB', '12450.00');
await deposit(hanna, 'USD', '320.00');
await deposit(dawit, 'ETB', '5400.00');
await deposit(meron, 'ETB', '7810.50');
await deposit(meron, 'EUR', '150.00');

console.log('\nTransfers');
await transfer(hanna, dawit.email, 'ETB', '1250.00');
await transfer(hanna, meron.email, 'ETB', '430.75');
await transfer(dawit, hanna.email, 'ETB', '900.00');
await transfer(meron, hanna.email, 'ETB', '215.50');
await transfer(hanna, dawit.email, 'USD', '40.00');

console.log('\nWithdrawal');
const withdrawal = await api('POST', '/api/funds/withdraw', {
  token: token(hanna),
  body: { currency: 'ETB', amount: '600.00', pin: PIN, idempotencyKey: `demo-wd-${run}` },
});
if (withdrawal.status === 200) {
  console.log(`  paid out      600.00 ETB  ${hanna.name}   ${withdrawal.body.reference}`);
} else {
  console.log(`  still blocked at this tier: ${withdrawal.body?.code ?? withdrawal.status}`);
}

const wallet = await api('GET', '/api/wallet', { token: token(hanna) });
if (wallet.status !== 200) die('reading the demo wallet', wallet);
console.log(`\n${hanna.name} now holds (tier ${wallet.body.tier}):`);
for (const a of wallet.body.accounts) {
  console.log(`  ${a.currency}  available ${a.available.padStart(11)}   balance ${a.balance}`);
}
console.log(
  `  ${wallet.body.recent.length} movements in recent activity, ` +
    `${wallet.body.limits.remainingToday} of today's limit still usable`
);

console.log(`
The three customers sign in with the password "${PASSWORD}" and the PIN ${PIN}:
  ${hanna.email}   the wallet to look at
  ${dawit.email}   a counterparty
  ${meron.email}   a counterparty
The review desk, ${reviewer.email}, was already on this machine and keeps its own
password ("correct horse battery", the one deploy/smoke-ui.mjs created it with).
`);
