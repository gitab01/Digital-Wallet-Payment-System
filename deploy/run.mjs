/*
 * Starts the local system: Spring Boot on :8080 and Next.js on :3000.
 *
 *   node deploy/run.mjs            both
 *   node deploy/run.mjs backend    api only
 *   node deploy/run.mjs frontend   client only
 *   node deploy/run.mjs test       integration tests against wallet_test
 *
 * backend/.env holds the generated database passwords and JWT key material. It is read
 * here and passed to the child process environment, so nothing sensitive has to be
 * typed, pasted, or stored in a shell profile.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const which = (process.argv[2] || 'all').toLowerCase();

function loadEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]),
  );
}

/**
 * A private-range IPv4 a phone on the same Wi-Fi can actually reach. 169.254 addresses
 * are what Windows reports when DHCP has nothing to hand out, so they are skipped.
 */
const PRIVATE = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/;

function lanAddress() {
  const candidates = [];
  for (const addresses of Object.values(networkInterfaces())) {
    for (const entry of addresses || []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      if (PRIVATE.test(entry.address)) return entry.address;
      if (!entry.address.startsWith('169.254.')) candidates.push(entry.address);
    }
  }
  return candidates[0] || '127.0.0.1';
}

const mvn = existsSync(join(root, 'backend', 'mvnw.cmd'))
  ? join(root, 'backend', process.platform === 'win32' ? 'mvnw.cmd' : 'mvnw')
  : 'mvn';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const ip = lanAddress();
// Another project can already own 3000 on this machine; FRONTEND_PORT moves the client.
const webPort = process.env.FRONTEND_PORT || '3000';

function run(name, command, args, cwd, env, colour) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    // Maven and npm arrive as .cmd batch files on Windows, which cannot be forked
    // directly. No argument here contains a space, so the shell adds no quoting risk.
    shell: process.platform === 'win32',
  });
  const tag = `\x1b[${colour}m[${name}]\x1b[0m`;
  const pipe = (stream, target) => {
    stream.on('data', (chunk) => target.write(tag + ' ' + chunk));
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    process.stdout.write(`${tag} exited with code ${code}\n`);
    if (code !== 0) process.exit(code ?? 1);
  });
  child.on('error', (err) => {
    process.stderr.write(`${tag} could not start: ${err.message}\n`);
    if (err.code === 'ENOENT' && name === 'api') {
      process.stderr.write(
        `${tag} Maven was not found. Install it, or add backend/mvnw.cmd, then re-run.\n`,
      );
    }
    process.exit(1);
  });
  return child;
}

const children = [];

if (which === 'test') {
  // Failsafe runs the integration tests against wallet_test, which the migrations
  // create from scratch, so it needs the same generated credentials the app uses.
  const env = loadEnv(join(root, 'backend', '.env'));
  // Trailing arguments reach Maven, so one class can be re-run without the full suite:
  //   node deploy/run.mjs test -Dit.test=LedgerEngineIT
  run('test', mvn, ['-B', 'verify', ...process.argv.slice(3)], join(root, 'backend'), env, '33');
}

if (which === 'all' || which === 'backend') {
  const env = loadEnv(join(root, 'backend', '.env'));
  if (!env.DB_APP_PASSWORD) {
    console.error('backend/.env is missing its generated secrets. Run: node deploy/provision.mjs');
    process.exit(1);
  }
  children.push(
    run('api', mvn, ['-o', 'spring-boot:run'], join(root, 'backend'), {
      // The API has to know which client origins exist. A phone opens the client at
      // this machine's LAN address rather than at localhost, and the browser refuses
      // any cross-origin call the server has not named, so both are allowed here.
      WALLET_CORS_ALLOWED_ORIGIN_PATTERNS: [
        `http://localhost:${webPort}`,
        `http://127.0.0.1:${webPort}`,
        `http://[::1]:${webPort}`,
        `http://${ip}:${webPort}`,
      ].join(','),
      ...env,
    }, '36'),
  );
}

if (which === 'all' || which === 'frontend') {
  // The client is reachable from a phone only if Next binds every interface and the
  // API origin it hands the browser is the LAN address, not localhost.
  const frontendEnv = loadEnv(join(root, 'frontend', '.env.local'));
  children.push(
    run('web', npm, ['run', 'dev', '--', '-H', '0.0.0.0', '-p', webPort], join(root, 'frontend'), {
      NEXT_PUBLIC_API_BASE_URL: `http://${ip}:8080`,
      ...frontendEnv,
    }, '35'),
  );
}

console.log(`LAN client address: http://${ip}:${webPort}   (api: http://${ip}:8080)`);

const stop = () => children.forEach((c) => c.kill('SIGTERM'));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
