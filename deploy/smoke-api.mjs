import http from 'node:http';

const BASE = { host: '127.0.0.1', port: 8080 };

function call(method, path, { body, token } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      { ...BASE, method, path, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          const text = buf.toString('utf8');
          let parsed = text;
          try { parsed = JSON.parse(text); } catch { /* csv / pdf */ }
          resolve({ status: res.statusCode, headers: res.headers, body: parsed, text, buf });
        });
      });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

let failed = 0;
function check(label, res, expect = 200) {
  const ok = res.status === expect;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label} -> ${res.status}${ok ? '' : ', wanted ' + expect}`);
  if (!ok) console.log('     ' + String(res.text).slice(0, 300));
  return res.body;
}
const note = (label, value) => console.log(`   ${label}: ${value}`);

const stamp = Date.now();
const emailA = `alice.${stamp}@example.com`;
const emailB = `bob.${stamp}@example.com`;
const opsEmail = 'ops@wallet.local';
const docA = `ETB${stamp}01`;
const signup = (email, name, pin, doc) => ({
  email, fullName: name, password: 'correct horse battery', pin,
  phone: '+251911223344', dateOfBirth: '1995-05-05', country: 'ET',
  documentType: 'NATIONAL_ID', documentNumber: doc,
});

console.log('--- onboarding ---');
const a = check('register alice', await call('POST', '/api/auth/register', { body: signup(emailA, 'Alice Example', '1122', docA) }), 201);
const b = check('register bob', await call('POST', '/api/auth/register', { body: signup(emailB, 'Bob Example', '3344', `ETB${stamp}02`) }), 201);
const ops = await call('POST', '/api/auth/register', { body: signup(opsEmail, 'Ops Reviewer', '7788', `OPS${stamp}`) });
if (ops.status !== 201 && ops.status !== 409) {
  console.log(`FAIL reviewer onboarding -> ${ops.status}`);
  failed++;
} else {
  console.log(`PASS reviewer onboarding (${ops.status === 201 ? 'registered' : 'already existed'})`);
}
const opsSession = ops.status === 201
  ? ops.body
  : check('reviewer login', await call('POST', '/api/auth/login', { body: { email: opsEmail, password: 'correct horse battery' } }));
check('duplicate document rejected', await call('POST', '/api/auth/register', {
  body: signup(`carl.${stamp}@example.com`, 'Carl Example', '5566', docA),
}), 409);
check('short pin rejected', await call('POST', '/api/auth/register', {
  body: signup(`dora.${stamp}@example.com`, 'Dora Example', '12', `ETB${stamp}03`),
}), 400);

const tokA = a.tokens.accessToken, tokB = b.tokens.accessToken, tokOps = opsSession.tokens.accessToken;
note('alice', `tier ${a.user.kycTier} ${a.user.status}, token type ${a.tokens.tokenType}, ttl ${a.tokens.expiresIn}s`);

console.log('\n--- request validation on money calls (ops budget) ---');
check('missing pin refused', await call('POST', '/api/funds/deposit', {
  token: tokOps, body: { currency: 'ETB', amount: '10.00', idempotencyKey: `m${stamp}` },
}), 400);
check('malformed amount refused', await call('POST', '/api/funds/deposit', {
  token: tokOps, body: { currency: 'ETB', amount: '10.009', pin: '7788', idempotencyKey: `f${stamp}` },
}), 400);
check('wrong pin refused', await call('POST', '/api/funds/deposit', {
  token: tokOps, body: { currency: 'ETB', amount: '10.00', pin: '9999', idempotencyKey: `w${stamp}` },
}), 401);

console.log('\n--- money movement (alice) ---');
const w0 = check('wallet alice', await call('GET', '/api/wallet', { token: tokA }));
note('accounts', JSON.stringify(w0.accounts.map((x) => [x.currency, x.balance])));
note('tier-0 limits', JSON.stringify(w0.limits));
check('withdrawal frozen below tier 1', await call('POST', '/api/funds/withdraw', {
  token: tokA, body: { currency: 'ETB', amount: '10.00', pin: '1122', idempotencyKey: `z${stamp}` },
}), 403);
check('deposit 500.00', await call('POST', '/api/funds/deposit', {
  token: tokA, body: { currency: 'ETB', amount: '500.00', pin: '1122', idempotencyKey: `d${stamp}` },
}));
const q = check('quote 75.50', await call('GET', `/api/transfers/quote?toEmail=${encodeURIComponent(emailB)}&currency=ETB&amount=75.50`, { token: tokA }));
note('quote', JSON.stringify(q));
const t = check('p2p transfer 75.50', await call('POST', '/api/transfers', {
  token: tokA, body: { toEmail: emailB, currency: 'ETB', amount: '75.50', pin: '1122', idempotencyKey: `x${stamp}` },
}));
note('transfer', JSON.stringify(t));
const replay = check('idempotent replay', await call('POST', '/api/transfers', {
  token: tokA, body: { toEmail: emailB, currency: 'ETB', amount: '75.50', pin: '1122', idempotencyKey: `x${stamp}` },
}));
note('replayed / same reference', `${replay.replayed} / ${replay.reference === t.reference}`);
if (replay.replayed !== true || replay.reference !== t.reference) failed++;

const w1 = check('wallet alice after transfer', await call('GET', '/api/wallet', { token: tokA }));
const wB = check('wallet bob after transfer', await call('GET', '/api/wallet', { token: tokB }));
note('alice ETB / bob ETB', `${w1.accounts.find((x) => x.currency === 'ETB').balance} / ${wB.accounts.find((x) => x.currency === 'ETB').balance}`);

console.log('\n--- ledger refusals (bob budget) ---');
check('overdraft refused', await call('POST', '/api/transfers', {
  token: tokB, body: { toEmail: emailA, currency: 'ETB', amount: '9000.00', pin: '3344', idempotencyKey: `o${stamp}` },
}), 409);
const carol = check('register carol', await call('POST', '/api/auth/register', {
  body: signup(`carol.${stamp}@example.com`, 'Carol Example', '6677', `ETB${stamp}04`),
}), 201);
const tokC = carol.tokens.accessToken;
check('carol funded with 10 000.00', await call('POST', '/api/funds/deposit', {
  token: tokC, body: { currency: 'ETB', amount: '10000.00', pin: '6677', idempotencyKey: `c${stamp}` },
}));
const overCeiling = check('per-transaction ceiling enforced', await call('POST', '/api/transfers', {
  token: tokC, body: { toEmail: emailA, currency: 'ETB', amount: '6000.00', pin: '6677', idempotencyKey: `t${stamp}` },
}), 403);
note('rejection details', JSON.stringify(overCeiling.details ?? overCeiling));
check('ceiling is visible before it is hit', await call('GET', `/api/transfers/quote?toEmail=${encodeURIComponent(emailA)}&currency=ETB&amount=6000.00`, { token: tokC }));
check('unknown recipient', await call('POST', '/api/transfers', {
  token: tokB, body: { toEmail: 'nobody@example.com', currency: 'ETB', amount: '5.00', pin: '3344', idempotencyKey: `u${stamp}` },
}), 404);
check('unsupported currency', await call('POST', '/api/accounts', { token: tokB, body: { currency: 'GBP' } }), 400);
check('all three wallets already open', await call('POST', '/api/accounts', { token: tokB, body: { currency: 'USD' } }), 409);

console.log('\n--- read side ---');
const list = check('history', await call('GET', '/api/transactions?page=0&size=10', { token: tokA }));
note('rows', `${list.total} ` + JSON.stringify(list.items.map((r) => [r.reference, r.type, r.direction, r.amount])));
const detail = check('transaction detail', await call('GET', `/api/transactions/${t.reference}`, { token: tokA }));
note('detail', JSON.stringify(detail).slice(0, 600));
const flatDetail = detail.reference === t.reference && detail.amount && detail.status === 'COMPLETED'
  && detail.ledgerEntryIds?.length === 4 && detail.entries?.length === 4;
console.log(`${flatDetail ? 'PASS' : 'FAIL'} detail is flat and names its four ledger entries`);
if (!flatDetail) failed++;
const other = check('counterparty can read same detail', await call('GET', `/api/transactions/${t.reference}`, { token: tokB }));
note('counterparty view direction', JSON.stringify(other.entries ?? other).slice(0, 200));
check('unknown reference 404', await call('GET', '/api/transactions/WLT-XXXXXXXX', { token: tokA }), 404);

const csv = await call('GET', '/api/statements?format=csv', { token: tokA });
const csvOk = csv.status === 200 && csv.text.includes(t.reference) && csv.text.charCodeAt(0) === 0xfeff;
console.log(`${csvOk ? 'PASS' : 'FAIL'} csv statement -> ${csv.status}, ${csv.buf.length} bytes, BOM=${csv.text.charCodeAt(0) === 0xfeff}, ${csv.headers['content-disposition']}`);
if (!csvOk) failed++;
const pdf = await call('GET', '/api/statements?format=pdf', { token: tokA });
const pdfOk = pdf.status === 200 && pdf.buf.subarray(0, 4).toString() === '%PDF' && pdf.buf.subarray(-6).toString().includes('EOF');
console.log(`${pdfOk ? 'PASS' : 'FAIL'} pdf statement -> ${pdf.status}, ${pdf.buf.length} bytes`);
if (!pdfOk) failed++;

console.log('\n--- auth surface ---');
check('anonymous 401', await call('GET', '/api/wallet'), 401);
check('tampered token 401', await call('GET', '/api/wallet', { token: tokA + 'x' }), 401);
check('malformed token 401', await call('GET', '/api/wallet', { token: 'not.a.jwt' }), 401);
const jwks = check('jwks', await call('GET', '/api/jwks'));
note('keys / leaks private material', `${jwks.keys.length} / ${jwks.keys.some((k) => k.d)}`);
const refreshed = check('refresh', await call('POST', '/api/auth/refresh', { body: { refreshToken: a.tokens.refreshToken } }));
note('rotated pair issued', Boolean(refreshed.accessToken) && Boolean(refreshed.refreshToken));
check('spent refresh token refused', await call('POST', '/api/auth/refresh', { body: { refreshToken: a.tokens.refreshToken } }), 401);
check('logout', await call('POST', '/api/auth/logout', { body: { refreshToken: refreshed.refreshToken } }), 204);
check('logged-out refresh refused', await call('POST', '/api/auth/refresh', { body: { refreshToken: refreshed.refreshToken } }), 401);
check('access token still valid after logout', await call('GET', '/api/wallet', { token: refreshed.accessToken }), 200);

console.log('\n--- rate limiting ---');
let limited = 0;
for (let i = 0; i < 10; i++) {
  const r = await call('POST', '/api/auth/login', { body: { email: emailA, password: 'wrong password here' } });
  if (r.status === 429) { limited = i + 1; note('tripped at request', `${i + 1}, Retry-After=${r.headers['retry-after']}, code=${r.body.code}`); break; }
}
const rlOk = limited > 0 && limited <= 7;
console.log(`${rlOk ? 'PASS' : 'FAIL'} login rate limiting returns 429`);
if (!rlOk) failed++;

console.log('\n--- reviewer + kyc ---');
check('customer cannot reach admin', await call('GET', '/api/admin/kyc-queue', { token: b.tokens.accessToken }), 403);
check('customer cannot decide', await call('POST', '/api/kyc/1/decision', { token: b.tokens.accessToken, body: { approve: true } }), 403);
const queue = check('kyc queue', await call('GET', '/api/admin/kyc-queue', { token: tokOps }));
note('queue size', queue.length);
const mine = queue.find((r) => r.email === emailA);
note('alice submission', JSON.stringify(mine));
const approved = check('approve alice', await call('POST', `/api/kyc/${mine.recordId}/decision`, { token: tokOps, body: { approve: true } }));
note('decision', JSON.stringify(approved));
check('second decision on same record', await call('POST', `/api/kyc/${mine.recordId}/decision`, { token: tokOps, body: { approve: false } }), 409);
const wAfter = check('wallet after approval', await call('GET', '/api/wallet', { token: b.tokens.accessToken }));
const kyc = check('kyc history', await call('GET', '/api/kyc', { token: a.tokens.accessToken }));
check('register without phone', await call('POST', '/api/auth/register', {
  body: { ...signup(`erin.${stamp}@example.com`, 'Erin Example', '8899', `ETB${stamp}05`), phone: undefined },
}), 400);
check('impossible calendar date', await call('POST', '/api/auth/register', {
  body: { ...signup(`erin.${stamp}@example.com`, 'Erin Example', '8899', `ETB${stamp}05`), dateOfBirth: '2001-02-30' },
}), 400);
const upgraded = check('alice upgrades to tier 2', await call('POST', '/api/kyc', {
  token: a.tokens.accessToken,
  body: { documentType: 'PASSPORT', documentNumber: `PP${stamp}`, phone: '+251911223344', dateOfBirth: '1990-03-04', country: 'ET' },
}), 201);
note('alice after upgrade', `tier ${upgraded.tier} next ${upgraded.nextTier} documents ${upgraded.documents?.length}`);
check('duplicate upgrade collides', await call('POST', '/api/kyc', {
  token: a.tokens.accessToken,
  body: { documentType: 'DRIVING_LICENSE', documentNumber: `DL${stamp}`, phone: '+251911223344', dateOfBirth: '1990-03-04', country: 'ET' },
}), 409);
note('alice now', `tier ${kyc.tier} ${JSON.stringify(kyc.status)} next ${kyc.nextTier}`);
note('tier-1 limits', JSON.stringify(kyc.limits));

console.log('\n--- reconciliation ---');
const rec = check('reconcile', await call('POST', '/api/admin/reconcile?repair=false', { token: tokOps }));
note('summary', JSON.stringify(rec));
const wRec = check('wallet shows reconciliation', await call('GET', '/api/wallet', { token: a.tokens.accessToken }));
note('accounts', JSON.stringify(wRec.accounts.map((x) => [x.currency, x.balance, x.reconciled])));
check('reconcile is reviewer-only', await call('POST', '/api/admin/reconcile', { token: a.tokens.accessToken }), 403);

console.log('\n--- pin + audit ---');
check('change pin', await call('POST', '/api/me/pin', { token: a.tokens.accessToken, body: { currentPin: '1122', newPin: '2233' } }), 204);
check('new pin works', await call('POST', '/api/funds/deposit', {
  token: a.tokens.accessToken, body: { currency: 'ETB', amount: '5.00', pin: '2233', idempotencyKey: `p2${stamp}` },
}));
const me = check('profile', await call('GET', '/api/me', { token: a.tokens.accessToken }));
note('profile', JSON.stringify(me));
const audit = check('audit trail', await call('GET', '/api/me/audit?size=50', { token: a.tokens.accessToken }));
note('actions', JSON.stringify(audit.items.map((r) => r.action + ':' + r.outcome)));

console.log(failed ? `\nSMOKE: ${failed} FAILURES` : '\nSMOKE: ALL CHECKS PASSED');
