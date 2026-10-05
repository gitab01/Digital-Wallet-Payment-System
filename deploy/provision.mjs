/*
 * Provisions wallet_db on the local SQLEXPRESS instance.
 *   - wallet_migrate: DDL owner, used only by Flyway at release time
 *   - wallet_app:     runtime login, member of the wallet_runtime data-only role
 * Table-level grants and the append-only DENY live in the Flyway migrations so
 * the permission model is versioned alongside the schema.
 * Credentials are generated once into backend/.env so they never travel through
 * a command line or a chat transcript.
 */
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const envPath = join(root, 'backend', '.env');

function secret() {
  return (
    randomBytes(24)
      .toString('base64')
      .replace(/[^A-Za-z0-9+/]/g, '') + 'aA1!'
  );
}

/**
 * RS256 material in the exact encoding JwtKeyRing reads: base64 PKCS#8 for the private
 * half and base64 SPKI for the public half, each on one line so it survives a .env file.
 */
function rsaPair() {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });
  return { private: privateKey.toString('base64'), public: publicKey.toString('base64') };
}

function readEnv() {
  if (!existsSync(envPath)) return {};
  return Object.fromEntries(
    readFileSync(envPath, 'utf8')
      .split('\n')
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
  );
}

function ensureEnv(existing) {
  const env = { ...existing };
  if (!env.DB_MIGRATE_PASSWORD) env.DB_MIGRATE_PASSWORD = secret();
  if (!env.DB_APP_PASSWORD) env.DB_APP_PASSWORD = secret();

  // Two key ids exist from the start so the overlap window can be demonstrated on the
  // first day rather than only after a rotation has already been needed.
  if (!env.JWT_PRIVATE_KEY_CURRENT) {
    const current = rsaPair();
    const previous = rsaPair();
    env.JWT_PRIVATE_KEY_CURRENT = current.private;
    env.JWT_PUBLIC_KEY_CURRENT = current.public;
    env.JWT_PRIVATE_KEY_PREVIOUS = previous.private;
    env.JWT_PUBLIC_KEY_PREVIOUS = previous.public;
  }

  writeFileSync(envPath, Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', {
    mode: 0o600,
  });
  return env;
}

const env = ensureEnv(readEnv());

const perDatabase = (name) => `
USE ${name};

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'wallet_migrate')
  CREATE USER wallet_migrate FOR LOGIN wallet_migrate;
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'wallet_app')
  CREATE USER wallet_app FOR LOGIN wallet_app;

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'wallet_runtime' AND type = 'R')
  CREATE ROLE wallet_runtime;

-- The migrator must own the schema in whichever database Flyway targets, including
-- wallet_test, because the integration tests replay the migrations from scratch.
EXEC sp_addrolemember N'db_owner', N'wallet_migrate';
EXEC sp_addrolemember N'wallet_runtime', N'wallet_app';
`;

const sql = `
SET NOCOUNT ON;

IF DB_ID('wallet_db') IS NULL
  CREATE DATABASE wallet_db;
IF DB_ID('wallet_test') IS NULL
  CREATE DATABASE wallet_test;
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'wallet_migrate')
  CREATE LOGIN wallet_migrate WITH PASSWORD = N'${env.DB_MIGRATE_PASSWORD}',
    CHECK_POLICY = ON, DEFAULT_DATABASE = wallet_db;
ELSE
  ALTER LOGIN wallet_migrate WITH PASSWORD = N'${env.DB_MIGRATE_PASSWORD}';

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'wallet_app')
  CREATE LOGIN wallet_app WITH PASSWORD = N'${env.DB_APP_PASSWORD}',
    CHECK_POLICY = ON, DEFAULT_DATABASE = wallet_db;
ELSE
  ALTER LOGIN wallet_app WITH PASSWORD = N'${env.DB_APP_PASSWORD}';
GO
${perDatabase('wallet_db')}
${perDatabase('wallet_test')}
USE wallet_db;

SELECT DB_NAME() AS db, SUSER_SNAME() AS login_name, USER_NAME() AS db_user;
`;

const tmp = join(here, '.provision.generated.sql');
writeFileSync(tmp, sql);
console.log('Provisioning wallet_db on localhost,1433 with Windows auth ...');

try {
  execFileSync('sqlcmd', ['-S', 'localhost,1433', '-E', '-b', '-i', tmp], { stdio: 'inherit' });
} catch (err) {
  console.error('\nProvisioning failed. If the error is 15023/15025 the login already exists,',
    'or the Windows account lacks sysadmin rights on SQLEXPRESS.');
  process.exitCode = 1;
} finally {
  rmSync(tmp, { force: true });
}
