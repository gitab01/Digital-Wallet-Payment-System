/*
 * Prepares an Azure SQL Database for this app, which is the database a hosted API needs
 * because Render offers only PostgreSQL and every ledger guarantee here lives in SQL
 * Server triggers (see README, "Deploying").
 *
 *   node deploy/provision-azure.mjs --server mywallet.database.windows.net --admin abel
 *
 * It creates what the Flyway migrations assume already exists: the two server logins,
 * their database users, the data-only wallet_runtime role, and db_owner for the
 * migrator. The grants, the DENY on the ledger and the triggers are migration V1..V5 and
 * run themselves when the API first starts, so nothing about the permission model is
 * typed by hand here.
 *
 * Differences from deploy/provision.mjs, which handles the local SQLEXPRESS instance:
 *   - CREATE LOGIN runs only in master; the matching CREATE USER runs in the database.
 *   - CHECK_POLICY and DEFAULT_DATABASE are left out: Azure SQL Database always applies
 *     its own password policy and ignores both clauses, so stating them is an error.
 *   - Windows authentication does not exist there, so the server admin's password is
 *     asked for by sqlcmd, which prompts with hidden input when given -U without -P.
 *     It never enters this file, a command line, or a transcript.
 *   - The database itself is created in the portal, on the Basic tier. This script
 *     expects it to be already there and says so plainly if it is not.
 *
 * The generated SQL carries the two runtime passwords, which are reused from
 * backend/.env so the same credentials work on both instances. They are read here and
 * never printed; the temporary files are deleted before this exits.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const envPath = join(root, 'backend', '.env');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1] || fallback;
}

const server = arg('server');
const admin = arg('admin');
const database = arg('database', 'wallet_db');

if (!server || !admin) {
  console.error(
    'usage: node deploy/provision-azure.mjs --server <logical-server>.database.windows.net' +
      ' --admin <server-admin-login> [--database wallet_db]'
  );
  process.exit(1);
}

if (!server.includes('.database.windows.net')) {
  console.error(
    `"${server}" is not a fully qualified Azure SQL server name; it must end in` +
      ' .database.windows.net, because sqlcmd cannot resolve a logical server by short name.'
  );
  process.exit(1);
}

if (!existsSync(envPath)) {
  console.error(`no ${envPath}. The runtime passwords live there; run node deploy/provision.mjs first.`);
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
);

const missing = ['DB_MIGRATE_PASSWORD', 'DB_APP_PASSWORD'].filter((k) => !env[k]);
if (missing.length) {
  console.error(`backend/.env is missing ${missing.join(' and ')}.`);
  process.exit(1);
}

// Both values are interpolated into N'...' below. deploy/provision.mjs generates them as
// alphanumerics, so a quote in one means it was replaced by hand with something this
// script must not paste into a batch.
const unsafe = Object.entries(env)
  .filter(([k, v]) => k.endsWith('_PASSWORD') && v.includes("'"))
  .map(([k]) => k);
if (unsafe.length) {
  console.error(
    `${unsafe.join(' and ')} in backend/.env contains a single quote, which cannot be` +
      ' placed into the CREATE LOGIN statement this script builds. Regenerate it without one.'
  );
  process.exit(1);
}

const masterSql = `
SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'wallet_migrate')
  CREATE LOGIN wallet_migrate WITH PASSWORD = N'${env.DB_MIGRATE_PASSWORD}';
ELSE
  ALTER LOGIN wallet_migrate WITH PASSWORD = N'${env.DB_MIGRATE_PASSWORD}';

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'wallet_app')
  CREATE LOGIN wallet_app WITH PASSWORD = N'${env.DB_APP_PASSWORD}';
ELSE
  ALTER LOGIN wallet_app WITH PASSWORD = N'${env.DB_APP_PASSWORD}';

SELECT SUSER_SNAME() AS login_name, DB_NAME() AS in_database;
`;

/**
 * Idempotent the way provision.mjs cannot be: ALTER ROLE ADD MEMBER has no IF NOT EXISTS
 * form, so membership is tested through the catalog before it is asserted. A re-run then
 * reports the same state instead of failing on a duplicate principal.
 */
const addToRole = (role, member) => `
IF NOT EXISTS (
  SELECT 1 FROM sys.database_role_members r
  JOIN sys.database_principals m ON m.principal_id = r.member_principal_id
  JOIN sys.database_principals g ON g.principal_id = r.role_principal_id
  WHERE m.name = N'${member}' AND g.name = N'${role}'
)
  ALTER ROLE [${role}] ADD MEMBER [${member}];
`;

const databaseSql = `
SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'wallet_migrate')
  CREATE USER wallet_migrate FOR LOGIN wallet_migrate;
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'wallet_app')
  CREATE USER wallet_app FOR LOGIN wallet_app;

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'wallet_runtime' AND type = 'R')
  CREATE ROLE wallet_runtime;

${addToRole('db_owner', 'wallet_migrate')}
${addToRole('wallet_runtime', 'wallet_app')}

SELECT DB_NAME() AS db, USER_NAME() AS db_user, SUSER_SNAME() AS login_name;
`;

/*
 * The temporary batches carry the runtime passwords literally, and a run interrupted at
 * the password prompt exits before the cleanup below can run. They are written outside
 * the repository so an orphan is never one `git add` away from a commit.
 */
const files = {
  master: join(tmpdir(), 'wallet-provision-azure-master.sql'),
  database: join(tmpdir(), 'wallet-provision-azure-database.sql'),
};

function run(target, file, label) {
  console.log(`\n${label} ...`);
  // -U without -P is what makes sqlcmd ask for the password itself, with the input
  // hidden. -Z is not the prompt flag on this build: there it means "set a new password
  // and exit", so naming it would try to change the admin's password.
  execFileSync('sqlcmd', ['-S', `tcp:${server},1433`, '-d', target, '-U', admin, '-b', '-i', file], {
    stdio: 'inherit',
  });
}

writeFileSync(files.master, masterSql, { mode: 0o600 });
writeFileSync(files.database, databaseSql, { mode: 0o600 });

console.log(
  `Provisioning ${database} on ${server} as ${admin}. sqlcmd asks for the admin password twice,\n` +
    'once per connection; it is typed, never stored.'
);

let failed = false;
try {
  run('master', files.master, 'Creating the server logins in master');
  run(database, files.database, `Creating the users and roles in ${database}`);
} catch (err) {
  failed = true;
  console.error(
    '\nProvisioning failed. The three that mean this script is right and the setup is not:\n' +
      `  27xxx / "Cannot open database "${database}"  create ${database} in the portal first, on the Basic tier.\n` +
      '  "server principal ... does not exist"        the logins above did not commit; re-run this script.\n' +
      '  "Error 40615 / not authorized"               your IP is not on the server firewall yet: add it under\n' +
      '                                               Networking, or tick "Allow Azure and resource services".'
  );
} finally {
  for (const f of Object.values(files)) rmSync(f, { force: true });
}

if (!failed) {
  console.log(`
Provisioned. The rest is one item each in one place:

  [ ] Azure portal, logical server -> Networking -> Firewall: add Render's outbound
      addresses, listed on the service's Environment page in Render's dashboard. Without
      them the container starts and dies with "TCP error: 10060".
  [ ] Render dashboard -> New -> Blueprint, on the branch carrying render.yaml. It asks
      for the six values marked sync: false there; DB_HOST is ${server} and DB_NAME is
      ${database}.
  [ ] The two passwords are already on this machine, in backend/.env. Copy the lines
      without putting either one into a chat or a shell history:
      powershell -NoProfile -Command "Get-Content backend/.env | Select-String '^DB_APP_PASSWORD=|^DB_MIGRATE_PASSWORD='"
      then paste one line at a time into the blueprint prompt and clear the clipboard.
  [ ] First boot runs Flyway V1..V5 against ${database}; the runtime log should reach
      "Migrating schema ... to version 5" and then "Started WalletApplication".
  [ ] https://<service url from its Overview page>/actuator/health must answer UP before
      the client is built against it.
  [ ] From frontend/: vercel env add NEXT_PUBLIC_API_BASE_URL production, then
      vercel deploy --prod. That URL is baked into the bundle, so it cannot be changed by
      a restart -- only by another deployment.
`);
}

process.exitCode = failed ? 1 : 0;
