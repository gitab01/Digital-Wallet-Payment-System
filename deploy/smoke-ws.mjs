import http from 'node:http';
import { Client } from '../frontend/node_modules/@stomp/stompjs/esm6/index.js';

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
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed = text;
          try { parsed = JSON.parse(text); } catch { /* raw */ }
          resolve({ status: res.statusCode, body: parsed, text });
        });
      });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const stamp = Date.now();
const email = `ws.${stamp}@example.com`;
const reg = await call('POST', '/api/auth/register', {
  body: { email, fullName: 'Wren Socket', password: 'correct horse battery', pin: '4321', phone: '+251912334455', dateOfBirth: '1994-01-02', country: 'ET', documentType: 'PASSPORT', documentNumber: `WS${stamp}` },
});
if (reg.status !== 201) { console.log('register failed', reg.status, reg.text); process.exit(1); }
const token = reg.body.tokens.accessToken;
console.log('registered', email);

const received = [];
const client = new Client({
  heartbeatIncoming: 0, heartbeatOutgoing: 0,
  webSocketFactory: () => new WebSocket('ws://127.0.0.1:8080/ws', ['v12.stomp', 'v114.stomp', 'v100.stomp']),
  connectHeaders: { Authorization: `Bearer ${token}` },
  onConnect: () => {
    console.log('STOMP connected');
    client.subscribe('/user/queue/balances', (m) => { received.push(['balances', JSON.parse(m.body)]); });
    client.subscribe('/user/queue/transactions', (m) => { received.push(['transactions', JSON.parse(m.body)]); });
  },
  onStompError: (f) => console.log('STOMP error', f.headers.message, f.body),
  onWebSocketError: (e) => console.log('websocket error', e.message ?? e),
});
client.activate();

await new Promise((r) => setTimeout(r, 1500));
if (!received.length && client.connected !== true) console.log('   (not connected yet)');

const dep = await call('POST', '/api/funds/deposit', {
  token, body: { currency: 'ETB', amount: '120.00', pin: '4321', idempotencyKey: `wsdep${stamp}` },
});
console.log('deposit ->', dep.status, dep.body.reference ?? dep.body.code);

await new Promise((r) => setTimeout(r, 1500));

const anon = new Client({
  heartbeatIncoming: 0, heartbeatOutgoing: 0,
  webSocketFactory: () => new WebSocket('ws://127.0.0.1:8080/ws', ['v12.stomp', 'v114.stomp', 'v100.stomp']),
  onWebSocketError: () => {},
});
let anonConnected = false;
anon.onConnect = () => { anonConnected = true; };
anon.activate();
await new Promise((r) => setTimeout(r, 1200));

console.log('\nframes received:');
for (const [dest, body] of received) console.log(`  ${dest}: ${JSON.stringify(body)}`);
const ok = received.length >= 2 && received.some(([, b]) => b.balance === '120.00' || b.available === '120.00');
console.log(`${ok ? 'PASS' : 'FAIL'} balance pushed over websocket after the commit`);
console.log(`${anonConnected ? 'FAIL anonymous STOMP connect accepted' : 'PASS anonymous STOMP connect refused'} (connected=${anonConnected})`);
client.deactivate();
anon.deactivate();
process.exit(ok && !anonConnected ? 0 : 1);
