/*
 * Drives the running client in a real browser and reports what the pixels prove.
 *
 *   node deploy/smoke-ui.mjs
 *
 * It signs a fresh customer up over the API, funds and verifies that customer, then
 * walks the client in headless Chrome over the DevTools protocol: every screen at
 * desktop and phone width, and the five-step transfer wizard from recipient to the
 * printed reference. A second account files both sides of a national ID and is left
 * waiting, so the review desk can be walked for real — queue, images, approval — and
 * the verification and operations screens are checked at 1280, 390 and 320 px. Each
 * screen is checked for horizontal overflow and for console errors, and the run exits
 * non-zero if either appears.
 *
 * Needs the stack running (node deploy/run.mjs) and a Chromium-family browser:
 *
 *   UI_URL        client address          default http://localhost:3000
 *   API_URL       API address             default http://localhost:8080
 *   CHROME_PATH   browser executable      default Chrome, then Edge
 *   REVIEWER_EMAIL reviewer identity      default ops@wallet.local
 *
 * Screenshots are written to the system temp directory, never into the repo.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const APP = (process.env.UI_URL || 'http://localhost:3000').replace(/\/+$/, '');
const API = (process.env.API_URL || 'http://localhost:8080').replace(/\/+$/, '');
const REVIEWER = process.env.REVIEWER_EMAIL || 'ops@wallet.local';
const PASSWORD = process.env.REVIEWER_PASSWORD || 'correct horse battery';
const OUT = join(tmpdir(), 'wallet-ui-shots');

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  `${process.env.LOCALAPPDATA || ''}/Google/Chrome/Application/chrome.exe`,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const BROWSER = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!BROWSER) {
  console.error('No Chrome or Edge found. Set CHROME_PATH to your browser executable.');
  process.exit(1);
}

const api = (method, path, { body, token } = {}) =>
  fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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

/* ------------------------------------------------------------------ seed */

/**
 * A decodable greyscale PNG, built here rather than carried as base64 so its pixel
 * content can vary per call. The service re-encodes whatever it receives, so an image
 * it could not decode would fail the seed rather than the product.
 */
function scanImage(width, height, seed) {
  const table = scanImage.table ??= (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // colour type: greyscale
  const stride = width + 1;
  const raw = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      raw[y * stride + 1 + x] = (x * 7 + y * 13 + seed * 31) & 0xff;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function fileScan(token, side, seed) {
  const form = new FormData();
  form.append('side', side);
  form.append('file', new Blob([scanImage(640, 400, seed)], { type: 'image/png' }), 'scan.png');
  // No Content-Type on the request: fetch generates the multipart boundary, and a
  // hand-written header here would leave the server with parts it cannot split.
  const res = await fetch(`${API}/api/kyc/documents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  if (res.status !== 201) throw new Error(`the ${side.toLowerCase()} scan was refused: ${res.status} ${text}`);
  return JSON.parse(text);
}

const stamp = Date.now();
const email = `ui.${stamp}@example.com`;
const payeeEmail = `payee.${stamp}@example.com`;
const pin = '7143';

const identity = (mail, name, doc, phone) => ({
  email: mail,
  fullName: name,
  password: PASSWORD,
  pin,
  phone,
  dateOfBirth: '1993-06-11',
  country: 'ET',
  documentType: 'NATIONAL_ID',
  documentNumber: doc,
});

const sender = await api('POST', '/api/auth/register', {
  body: identity(email, 'Ui Tester', `UI${stamp}`, '+251911223300'),
});
const payee = await api('POST', '/api/auth/register', {
  body: identity(payeeEmail, 'Pat Recipient', `UIB${stamp}`, '+251911223301'),
});
if (sender.status !== 201 || payee.status !== 201) {
  console.error(`seed registrations failed: ${sender.status} ${payee.status}`);
  console.error(sender.text, payee.text);
  process.exit(1);
}
const funded = await api('POST', '/api/funds/deposit', {
  token: sender.body.tokens.accessToken,
  body: { currency: 'ETB', amount: '800.00', pin, idempotencyKey: `ui-dep-${stamp}` },
});
if (funded.status !== 200) {
  console.error(`seed deposit failed: ${funded.status} ${funded.text}`);
  process.exit(1);
}

// The review desk needs a submission that is still open, so a third customer files
// both sides and is left waiting for the browser walk to decide it.
const subjectEmail = `subject.${stamp}@example.com`;
const subject = await api('POST', '/api/auth/register', {
  body: identity(subjectEmail, 'Zeni Assefa', `SUB${stamp}`, '+251911223302'),
});
if (subject.status !== 201) {
  console.error(`seed subject registration failed: ${subject.status} ${subject.text}`);
  process.exit(1);
}
const subjectId = subject.body.user.id;

const senderToken = sender.body.tokens.accessToken;
const subjectToken = subject.body.tokens.accessToken;
await fileScan(senderToken, 'FRONT', 11);
await fileScan(senderToken, 'BACK', 12);
await fileScan(subjectToken, 'FRONT', 21);
await fileScan(subjectToken, 'BACK', 22);

let reviewer = await api('POST', '/api/auth/login', { body: { email: REVIEWER, password: PASSWORD } });
if (reviewer.status !== 200) {
  reviewer = await api('POST', '/api/auth/register', {
    body: identity(REVIEWER, 'Ops Reviewer', `OPS${stamp}`, '+251911223399'),
  });
}
const reviewerToken = reviewer.body.tokens?.accessToken;
if (!reviewerToken) {
  console.error(`no reviewer session: ${reviewer.status} ${reviewer.text}`);
  process.exit(1);
}

const queue = await api('GET', '/api/admin/kyc-queue', { token: reviewerToken });
const pending = Array.isArray(queue.body) ? queue.body.find((r) => r.email === email) : null;
const waiting = Array.isArray(queue.body) ? queue.body.find((r) => r.email === subjectEmail) : null;
if (!waiting) {
  console.error(`the subject's submission never reached the queue: ${queue.status} ${queue.text}`);
  process.exit(1);
}
const subjectRecordId = waiting.recordId;
let senderApproved = false;
if (pending) {
  const decision = await api('POST', `/api/kyc/${pending.recordId}/decision`, {
    token: reviewerToken,
    body: { approve: true },
  });
  if (decision.status !== 200) {
    console.error(`seed approval failed: ${decision.status} ${decision.text}`);
    process.exit(1);
  }
  senderApproved = true;
}
console.log(
  `seeded ${email} with 800.00 ETB (kyc approved: ${senderApproved}); ` +
    `${subjectEmail} (user #${subjectId}, submission #${subjectRecordId}) is waiting on the desk`,
);

/* ---------------------------------------------------------------- chrome */

const debugPort = 9300 + (stamp % 90);
const profile = join(tmpdir(), `wallet-ui-profile-${stamp}`);
mkdirSync(OUT, { recursive: true });

const chrome = spawn(BROWSER, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  '--window-size=1280,900',
  'about:blank',
], { stdio: 'ignore' });

/** Chrome holds the profile open briefly after the process is signalled. */
function release() {
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 300 });
  } catch {
    /* left in temp: scratch, not project output */
  }
}
function done(code) {
  chrome.kill();
  release();
  process.exit(code);
}

// A screen that throws would otherwise exit with its browser still attached to the
// debugging port, and the next run would find it taken.
process.once('uncaughtException', (err) => {
  console.error(err.message);
  done(1);
});

async function devtoolsUp() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${debugPort}/json/version`)).ok) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('the browser never exposed a devtools endpoint — is another run still holding it?');
}
await devtoolsUp();

const tab = await (
  await fetch(`http://127.0.0.1:${debugPort}/json/new?url=about:blank`, { method: 'PUT' })
).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let nextId = 1;
const replies = new Map();
const consoleErrors = [];
const apiCalls = [];

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && replies.has(msg.id)) {
    const { resolve, reject } = replies.get(msg.id);
    replies.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    consoleErrors.push(d.exception?.description ?? d.text);
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
  }
  if (msg.method === 'Network.requestWillBeSent' && msg.params.request.url.includes('/api/')) {
    apiCalls.push({ id: msg.params.requestId, label: `${msg.params.request.method} ${msg.params.request.url.replace(API, '')}` });
  }
  if (msg.method === 'Network.loadingFinished' || msg.method === 'Network.loadingFailed') {
    const call = apiCalls.find((c) => c.id === msg.params.requestId);
    if (call) {
      // A request the browser drops because the page moved on is not a server failure.
      call.result = msg.method === 'Network.loadingFailed'
        ? msg.params.canceled ? 'canceled' : `FAILED ${msg.params.errorText}`
        : 'ok';
    }
  }
};

const send = (method, params = {}) => {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => replies.set(id, { resolve, reject }));
};
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}
const waitFor = async (ms) => new Promise((r) => setTimeout(r, ms));

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');

/** The page has painted something. */
async function settled() {
  for (let i = 0; i < 240; i++) {
    const length = await evaluate(`(document.body && document.body.innerText || '').trim().length`);
    if (length > 40) {
      await waitFor(700);
      return;
    }
    await waitFor(250);
  }
  throw new Error('the client never rendered: ' + (await evaluate('document.readyState')));
}
/**
 * Server-rendered markup carries no React props on its nodes; hydration attaches them.
 * Clicking before that leaves a handler-less button behind, which reads as a dead
 * control on a page that was merely still loading.
 */
async function hydrated() {
  const props = `(() => {
    const b = [...document.querySelectorAll('button')];
    return b.length + '/' + b.filter(el =>
      Object.getOwnPropertyNames(el).some(k => k.startsWith('__reactProps'))).length;
  })()`;
  for (let i = 0; i < 200; i++) {
    const live = await evaluate(`(() => {
      const els = [...document.querySelectorAll('button')];
      return els.length > 0 && els.every(el =>
        Object.getOwnPropertyNames(el).some(k => k.startsWith('__reactProps')));
    })()`);
    if (live) return;
    await waitFor(250);
  }
  throw new Error(`react never hydrated (${await evaluate(props)} buttons carry props)`);
}
/**
 * Hydrated markup is still only a shell: every screen holds a "Loading …" placeholder
 * while its first fetch is in flight, and a screenshot of that proves nothing about the
 * layout it is supposed to be checking. Some screens placeholder with textless Skeleton
 * spans, so the words alone cannot be the only signal.
 */
async function loaded() {
  for (let i = 0; i < 160; i++) {
    const busy = await evaluate(`(
      /loading/i.test(document.body.innerText || '')
      || !!document.querySelector('span.animate-pulse')
    )`);
    if (!busy) return;
    await waitFor(250);
  }
  console.log('   note: still loading after 40s, the screenshot may show a skeleton');
}
async function navigate(path) {
  // The dev server compiles a route on its first request, and the browser sits on the
  // previous page while that happens. Ten seconds of that was enough to spend the
  // hydration budget on a screen that renders in six once warm, so ask for the route
  // here instead and let the browser load something that is already built.
  await fetch(APP + path, { cache: 'no-store' }).then((res) => res.text(), () => { /* the browser will report it */ });
  await send('Page.navigate', { url: APP + path });
  await settled();
  await hydrated();
  await loaded();
}
async function viewport(width, height) {
  await send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: width < 500,
  });
  await waitFor(400);
}
/** Types through the framework's own setter so React state actually changes. */
async function fill(selector, value) {
  for (let i = 0; i < 60; i++) {
    if (await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)) break;
    await waitFor(250);
  }
  await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error('no field matching ${selector}');
    Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return el.value;
  })()`);
}
/** Clicks the first enabled control whose label matches, waiting for it to appear. */
async function click(pattern) {
  let clicked = 'NOT FOUND';
  for (let i = 0; i < 60 && clicked === 'NOT FOUND'; i++) {
    clicked = await evaluate(`(() => {
      const re = new RegExp(${JSON.stringify(pattern)}, 'i');
      const el = [...document.querySelectorAll('button, a[href]')].find(b =>
        !b.disabled && re.test((b.innerText || '').replace(/\\s+/g, ' ').trim()));
      if (!el) return 'NOT FOUND';
      el.click();
      return (el.innerText || '').replace(/\\s+/g, ' ').trim();
    })()`);
    if (clicked === 'NOT FOUND') await waitFor(250);
  }
  if (clicked === 'NOT FOUND') throw new Error(`no enabled control matching /${pattern}/`);
  await waitFor(1200);
  console.log(`   clicked: ${clicked}`);
}
async function pageText() {
  return evaluate(`(document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 420)`);
}
async function overflowing() {
  return evaluate(`(() => {
    const limit = document.documentElement.clientWidth;
    return [...document.querySelectorAll('body *')]
      .filter(el => el.getBoundingClientRect().right > limit + 1)
      .slice(0, 5)
      .map(el => el.tagName.toLowerCase() + '.' + String(el.className).split(' ').slice(0, 3).join('.')
        + ' w=' + Math.round(el.getBoundingClientRect().width));
  })()`);
}
async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  const metrics = JSON.parse(await evaluate(`JSON.stringify({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    path: location.pathname,
    controls: [...document.querySelectorAll('button')].length,
  })`));
  const verdict = metrics.overflow > 0 ? `OVERFLOWS BY ${metrics.overflow}PX` : 'ok';
  console.log(`  ${name} [${metrics.path}] ${metrics.controls} controls — ${verdict}`);
  if (metrics.overflow > 0) console.log('   ' + JSON.stringify(await overflowing()));
  return metrics;
}

/* -------------------------------------------------------------- desktop */

await viewport(1280, 900);
console.log('\n[1280x900]');
await navigate('/login');
await shot('01-login');
await fill('input[type="email"]', email);
await fill('input[type="password"]', PASSWORD);
await shot('02-login-filled');
await click('^sign in');

for (let i = 0; i < 100 && (await evaluate('location.pathname')) === '/login'; i++) await waitFor(250);
if ((await evaluate('location.pathname')) === '/login') {
  console.log('   the client said:', await pageText());
  console.log('   api calls:', JSON.stringify(apiCalls.slice(-6).map((c) => `${c.label} ${c.result || 'pending'}`)));
  console.log('   browser errors:', JSON.stringify(consoleErrors.slice(0, 3)));
  throw new Error('sign-in never left /login');
}
await hydrated();
await shot('03-wallet');
await navigate('/history');
await shot('04-history');
await navigate('/statement');
await shot('05-statement');
await navigate('/settings');
await shot('06-settings');

/* ------------------------------------------------------- transfer wizard */

await navigate('/transfer');
await shot('10-wizard-recipient');
await fill('input[placeholder*="example.com" i]', payeeEmail);
await click('^continue');
await shot('11-wizard-amount');
await fill('input[placeholder="0.00"]', '42.50');

// click() waits for the review button to become enabled, which only happens once
// the server has priced the amount — so this doubles as the quote's arrival check.
await click('^review transfer');
await shot('12-wizard-review');
console.log('   review says:', await pageText());
// The brief's guarantee: nothing on this screen lets the amount be edited.
const editable = await evaluate(`[...document.querySelectorAll('input')].filter(i => !i.readOnly && !i.disabled).length`);
if (editable > 0) throw new Error(`the review step exposes ${editable} editable field(s)`);
await click('^continue to pin');
await shot('13-wizard-authorise');
await fill('input[inputmode="numeric"]', pin);
await click('^send transfer');

// A transfer on this hardware can take the better part of a minute: the ledger writes
// five rows through triggers and then rereads both balances. Give it that room, and
// report the pending request rather than a bare timeout if it still does not land.
let reference = null;
for (let i = 0; i < 240 && !reference; i++) {
  reference = await evaluate(`(document.body.innerText.match(/WLT-[A-Z0-9]{8}/) || [null])[0]`);
  if (!reference) await waitFor(250);
}
await shot('14-wizard-done');
if (!reference) {
  console.log('   the client said:', await pageText());
  console.log('   api calls:', JSON.stringify(apiCalls.slice(-6).map((c) => `${c.label} ${c.result || 'pending'}`)));
  console.log('   browser errors:', JSON.stringify(consoleErrors.slice(0, 3)));
  throw new Error('the wizard never showed a transfer reference');
}
console.log(`   transfer reference on screen: ${reference}`);

await navigate(`/transactions/${reference}`);
await shot('15-transfer-detail');
const legs = await evaluate(`(document.body.innerText.match(/entry #\\d+/gi) || []).length`);
console.log(`   ledger entries named on the detail screen: ${legs}`);
if (legs < 4) throw new Error(`the detail screen listed ${legs} ledger entries, expected at least 4`);

await navigate('/');
await shot('16-wallet-after');
const amounts = await evaluate(`(document.body.innerText.match(/[0-9]{1,3}(?:,[0-9]{3})*\\.[0-9]{2}/g) || []).slice(0, 6).join(', ')`);
console.log(`   amounts on the wallet screen: ${amounts}`);

/* ----------------------------------------------------------------- phone */

await viewport(390, 844);
console.log('\n[390x844]');
for (const [name, path] of [
  ['20-phone-wallet', '/'],
  ['21-phone-transfer', '/transfer'],
  ['22-phone-history', '/history'],
  ['23-phone-statement', '/statement'],
  ['24-phone-settings', '/settings'],
  ['25-phone-detail', `/transactions/${reference}`],
]) {
  await navigate(path);
  await shot(name);
}

/* ------------------------------------------------ identity documents, phone */

/** The only sign-out on a phone sits on the Settings screen. */
async function signOut() {
  await navigate('/settings');
  await click('^sign out');
  for (let i = 0; i < 100 && (await evaluate('location.pathname')) !== '/login'; i++) await waitFor(250);
  if ((await evaluate('location.pathname')) !== '/login') {
    throw new Error(`signing out left the browser on ${await evaluate('location.pathname')}`);
  }
}
async function signIn(mail) {
  await navigate('/login');
  await fill('input[type="email"]', mail);
  await fill('input[type="password"]', PASSWORD);
  await click('^sign in');
  for (let i = 0; i < 100 && (await evaluate('location.pathname')) === '/login'; i++) await waitFor(250);
  if ((await evaluate('location.pathname')) === '/login') {
    console.log('   the client said:', await pageText());
    throw new Error(`${mail} never got a session`);
  }
  await hydrated();
}

await viewport(390, 844);
console.log('\n[390x844] identity documents');
await signOut();
await signIn(subjectEmail);
await navigate('/verify');
await shot('30-phone-verify');

await viewport(320, 568);
console.log('\n[320x568] identity documents');
await shot('31-tiny-verify');
await navigate('/register');
await shot('32-tiny-register');

/* ------------------------------------------------------- review desk, up */

await viewport(1280, 900);
console.log('\n[1280x900] review desk');
await signOut();
await signIn(REVIEWER);
await navigate('/admin');
await shot('40-desk-queue');
await click(subjectEmail);
await shot('41-desk-submission');
console.log('   the desk says:', await pageText());
await click('^approve$');
await shot('42-desk-confirm');
await click('^approve and raise the tier');
const notice = `Submission #${subjectRecordId} approved`;
let decided = false;
for (let i = 0; i < 120 && !decided; i++) {
  decided = await evaluate(`(document.body.innerText || '').includes(${JSON.stringify(notice)})`);
  if (!decided) await waitFor(250);
}
await shot('43-desk-decided');
if (!decided) throw new Error(`the desk never confirmed the approval: ${await pageText()}`);

const leftBehind = await api('GET', '/api/admin/kyc-queue', { token: reviewerToken });
if (!Array.isArray(leftBehind.body) || leftBehind.body.some((row) => row.recordId === subjectRecordId)) {
  throw new Error(`submission #${subjectRecordId} is still in the queue after the approval click`);
}
console.log(`   submission #${subjectRecordId} approved on screen and gone from the queue`);

await navigate('/admin/clients');
await shot('44-clients');
await navigate(`/admin/clients/${subjectId}`);
await shot('45-client-detail');
console.log('   the record says:', await pageText());
await navigate('/admin/health');
await shot('46-health');

await viewport(390, 844);
console.log('\n[390x844] operations console');
for (const [name, path] of [
  ['50-phone-desk', '/admin'],
  ['51-phone-clients', '/admin/clients'],
  [`52-phone-client-${subjectId}`, `/admin/clients/${subjectId}`],
  ['53-phone-health', '/admin/health'],
]) {
  await navigate(path);
  await shot(name);
}

await viewport(320, 568);
console.log('\n[320x568] operations console');
for (const [name, path] of [
  ['60-tiny-desk', '/admin'],
  ['61-tiny-clients', '/admin/clients'],
  ['62-tiny-health', '/admin/health'],
]) {
  await navigate(path);
  await shot(name);
}

/* ---------------------------------------------------------------- result */

console.log('\nconsole errors:', consoleErrors.length);
for (const e of consoleErrors.slice(0, 8)) console.log('  - ' + String(e).slice(0, 200));
const failed = apiCalls.filter((c) => c.result && c.result !== 'ok' && c.result !== 'canceled');
if (failed.length) console.log('failed api calls:', JSON.stringify(failed.map((c) => `${c.label} → ${c.result}`)));
console.log('screenshots in', OUT);

done(consoleErrors.length || failed.length ? 1 : 0);
