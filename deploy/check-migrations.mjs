/*
 * Applies the migration files to a scratch database, then attacks every invariant
 * the schema claims to protect. The hostile statements run under EXECUTE AS USER =
 * 'wallet_app' so the privilege model is tested alongside the triggers.
 *
 * A guard nobody has tried to break is only a rumour.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const migrationDir = join(root, 'backend', 'src', 'main', 'resources', 'db', 'migration');
const DB = 'wallet_db_check';
const TMP = join(here, '.check.generated.sql');

function run(script) {
  // sqlcmd opens with QUOTED_IDENTIFIER OFF; the filtered indexes in V1 need it
  // on, and so does the JDBC connection Flyway will actually use. Without this the
  // replay would fail for reasons that do not exist in the real migration path.
  const settings = `SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
GO
`;
  writeFileSync(TMP, settings + script);
  try {
    return execFileSync('sqlcmd', ['-S', 'localhost,1433', '-E', '-b', '-i', TMP],
      { encoding: 'utf8' });
  } finally {
    rmSync(TMP, { force: true });
  }
}

function attempt(label, body, expect) {
  let out;
  try {
    out = run(`USE ${DB};
EXECUTE AS USER = N'wallet_app';
BEGIN TRY
  BEGIN TRANSACTION;
  ${body}
  COMMIT TRANSACTION;
  SELECT N'__ALLOWED__' AS outcome;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  SELECT N'__DENIED__ ' + ERROR_MESSAGE() AS outcome;
END CATCH
REVERT;`);
  } catch (err) {
    // Statements that fail to even compile under the runtime role are still the
    // guard working, provided that is what we expected.
    const text = String(err.stdout || '') + String(err.stderr || '') + String(err.message);
    if (expect === 'denied' && /permission|denied|Append-only|not permitted/i.test(text)) return;
    throw new Error(`${label}: statement errored outside TRY/CATCH:\n${text.split('\n').slice(0, 6).join('\n')}`);
  }
  const allowed = out.includes('__ALLOWED__');
  if (expect === 'allowed' && !allowed) throw new Error(`${label}: expected to be allowed, got ${out.trim()}`);
  if (expect === 'denied' && allowed) throw new Error(`${label}: expected to be DENIED but it was accepted`);
}

const results = [];
function check(label, fn) {
  try {
    fn();
    results.push(['PASS', label]);
  } catch (err) {
    results.push(['FAIL', `${label}\n        ${String(err.message).split('\n').join('\n        ')}`]);
  }
}

console.log(`Rebuilding ${DB} and replaying migrations in Flyway order ...`);
run(`IF DATABASEPROPERTYEX(N'${DB}', 'Status') IS NOT NULL
     BEGIN USE master; ALTER DATABASE ${DB} SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
           DROP DATABASE ${DB}; END;
     CREATE DATABASE ${DB};`);

run(`USE ${DB};
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name='wallet_migrate')
  CREATE USER wallet_migrate FOR LOGIN wallet_migrate;
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name='wallet_app')
  CREATE USER wallet_app FOR LOGIN wallet_app;
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name='wallet_runtime' AND type='R')
  CREATE ROLE wallet_runtime;
EXEC sp_addrolemember N'db_owner', N'wallet_migrate';
EXEC sp_addrolemember N'wallet_runtime', N'wallet_app';`);

const files = readdirSync(migrationDir)
  .filter((f) => /^V\d+__.*\.sql$/.test(f))
  .sort((a, b) => Number(a.match(/^V(\d+)/)[1]) - Number(b.match(/^V(\d+)/)[1]));

for (const file of files) {
  console.log(`  applying ${file}`);
  run(`USE ${DB};\nGO\n${readFileSync(join(migrationDir, file), 'utf8')}`);
}

// Fixture: two wallets funded from the provider account, created through the same
// statement order the service uses so the guards see realistic traffic.
run(`USE ${DB};
DECLARE @uid BIGINT, @alice BIGINT, @bob BIGINT, @provider BIGINT, @fee BIGINT, @tid BIGINT;

INSERT INTO dbo.users (email, full_name, password_hash, pin_hash, kyc_tier, status)
  VALUES (N'alice@invariant.test', N'Alice One', N'x', N'x', 2, N'ACTIVE');
SET @uid = CAST(SCOPE_IDENTITY() AS BIGINT);
INSERT INTO dbo.users (email, full_name, password_hash, pin_hash, kyc_tier, status)
  VALUES (N'bob@invariant.test', N'Bob Two', N'x', N'x', 2, N'ACTIVE');
DECLARE @bobUid BIGINT = CAST(SCOPE_IDENTITY() AS BIGINT);

-- One wallet per currency per user, which is exactly what uq_accounts_owner_currency
-- exists to enforce, so the fixture must not try to hold two ETB wallets.
INSERT INTO dbo.accounts (user_id, currency, kind, label) VALUES (@uid, N'ETB', N'CUSTOMER_WALLET', N'alice');
SET @alice = CAST(SCOPE_IDENTITY() AS BIGINT);
INSERT INTO dbo.accounts (user_id, currency, kind, label) VALUES (@bobUid, N'ETB', N'CUSTOMER_WALLET', N'bob');
SET @bob = CAST(SCOPE_IDENTITY() AS BIGINT);
SELECT @provider = id FROM dbo.accounts WHERE kind = N'CASH_IN_PROVIDER' AND currency = N'ETB';
SELECT @fee = id FROM dbo.accounts WHERE kind = N'FEE_REVENUE' AND currency = N'ETB';

DECLARE @n INT;
SET @n = 1;
WHILE @n <= 2
BEGIN
  DECLARE @target BIGINT = CASE WHEN @n = 1 THEN @alice ELSE @bob END;
  INSERT INTO dbo.transfers (reference, owner_user_id, type, idempotency_key, to_account_id, currency, amount_cents, status)
    VALUES (N'FUND-' + CONVERT(NVARCHAR(4), @n), @uid, N'DEPOSIT', N'fund-' + CONVERT(NVARCHAR(4), @n), @target, N'ETB', 100000, N'PENDING');
  SET @tid = CAST(SCOPE_IDENTITY() AS BIGINT);
  INSERT INTO dbo.ledger_entries (transfer_id, account_id, amount_cents, entry_role, currency, balance_after_cents)
    VALUES (@tid, @target, 100000, N'CASH_IN', N'ETB', 100000),
           (@tid, @provider, -100000, N'CASH_IN', N'ETB', -100000 * @n);
  UPDATE dbo.transfers SET status = N'COMPLETED', completed_at = SYSUTCDATETIME() WHERE id = @tid;
  UPDATE dbo.accounts SET balance_cents = balance_cents + 100000, version = version + 1 WHERE id = @target;
  UPDATE dbo.accounts SET balance_cents = balance_cents - 100000, version = version + 1 WHERE id = @provider;
  SET @n = @n + 1;
END`);

const probe = run(`USE ${DB};
SELECT CONCAT(N'IDS|',
  (SELECT TOP 1 id FROM dbo.accounts WHERE label = N'alice'), N'|',
  (SELECT TOP 1 id FROM dbo.accounts WHERE label = N'bob'), N'|',
  (SELECT TOP 1 id FROM dbo.accounts WHERE kind = N'CASH_IN_PROVIDER' AND currency = N'ETB'), N'|',
  (SELECT TOP 1 id FROM dbo.accounts WHERE kind = N'FEE_REVENUE' AND currency = N'ETB'), N'|',
  (SELECT TOP 1 id FROM dbo.users WHERE email = N'alice@invariant.test')) AS probe;`);
const [, A, B, P, F, U] = probe.split('\n').find((l) => l.includes('IDS|')).trim().split('|').map((v) => v.trim());

const preamble = `DECLARE @alice BIGINT=${A}, @bob BIGINT=${B}, @provider BIGINT=${P}, @fee BIGINT=${F}, @uid BIGINT=${U}, @tid BIGINT, @r NVARCHAR(40);`;
const transfer = (key, from, to, amount, feeAmt, extraLegs) => `
  SET @r = N'${key}-' + SUBSTRING(REPLACE(CONVERT(NVARCHAR(36), NEWID()), N'-', N''), 1, 24);
  INSERT INTO dbo.transfers (reference, owner_user_id, type, idempotency_key, from_account_id, to_account_id, fee_account_id, currency, amount_cents, fee_cents, status)
    VALUES (@r, @uid, N'TRANSFER', N'${key}', ${from}, ${to}, ${feeAmt ? '@fee' : 'NULL'}, N'ETB', ${amount}, ${feeAmt}, N'PENDING');
  SET @tid = CAST(SCOPE_IDENTITY() AS BIGINT);
  INSERT INTO dbo.ledger_entries (transfer_id, account_id, amount_cents, entry_role, currency, balance_after_cents)
    VALUES ${extraLegs};`;

check('a balanced four-leg transfer posts', () =>
  attempt('balanced transfer', preamble + transfer('ok', '@alice', '@bob', 25000, 1000, `
    (@tid, @alice, -25000, N'FROM', N'ETB', 75000),
    (@tid, @bob,    25000, N'TO',   N'ETB', 125000),
    (@tid, @alice,  -1000, N'FEE',  N'ETB', 74000),
    (@tid, @fee,     1000, N'FEE_REVENUE', N'ETB', 1000);
  UPDATE dbo.transfers SET status = N'COMPLETED', completed_at = SYSUTCDATETIME() WHERE id = @tid;`), 'allowed'));

check('an unbalanced transfer is rejected', () =>
  attempt('unbalanced', preamble + transfer('unbalanced', '@alice', '@bob', 5000, 0, `
    (@tid, @alice, -5000, N'FROM', N'ETB', 0),
    (@tid, @bob,    4999, N'TO',   N'ETB', 0);`), 'denied'));

check('a fee with no revenue credit is rejected', () =>
  attempt('orphan fee', preamble + transfer('orphanfee', '@alice', '@bob', 5000, 1000, `
    (@tid, @alice, -6000, N'FROM', N'ETB', 0),
    (@tid, @bob,    6000, N'TO',   N'ETB', 0);`), 'denied'));

check('a wallet cannot be debited below zero', () =>
  attempt('overdraft', preamble + transfer('overdraft', '@alice', '@bob', 99999999, 0, `
    (@tid, @alice, -99999999, N'FROM', N'ETB', -1),
    (@tid, @bob,    99999999, N'TO',   N'ETB', 0);`), 'denied'));

check('a transfer cannot complete without entries', () =>
  attempt('phantom completion', preamble + `
    INSERT INTO dbo.transfers (reference, owner_user_id, type, idempotency_key, from_account_id, to_account_id, currency, amount_cents, status)
      VALUES (N'phantom', @uid, N'TRANSFER', N'phantom', @alice, @bob, N'ETB', 100, N'COMPLETED');`, 'denied'));

check('ledger entries cannot be updated', () =>
  attempt('update entry', `DECLARE @e BIGINT; SELECT TOP 1 @e = id FROM dbo.ledger_entries;
    UPDATE dbo.ledger_entries SET amount_cents = 1 WHERE id = @e;`, 'denied'));

check('ledger entries cannot be deleted', () =>
  attempt('delete entry', `DECLARE @e BIGINT; SELECT TOP 1 @e = id FROM dbo.ledger_entries;
    DELETE FROM dbo.ledger_entries WHERE id = @e;`, 'denied'));

check('an idempotency key cannot be reused', () =>
  attempt('idempotency', preamble + `
    INSERT INTO dbo.transfers (reference, owner_user_id, type, idempotency_key, from_account_id, to_account_id, currency, amount_cents, status)
      VALUES (N'dup-1', @uid, N'TRANSFER', N'dup', @alice, @bob, N'ETB', 100, N'PENDING');
    INSERT INTO dbo.transfers (reference, owner_user_id, type, idempotency_key, from_account_id, to_account_id, currency, amount_cents, status)
      VALUES (N'dup-2', @uid, N'TRANSFER', N'dup', @alice, @bob, N'ETB', 100, N'PENDING');`, 'denied'));

check('the runtime role cannot change schema', () =>
  attempt('ddl', `CREATE TABLE dbo.hacked (id INT); DROP TABLE dbo.hacked;`, 'denied'));

check('a negative currency amount is rejected', () =>
  attempt('negative amount', preamble + `
    INSERT INTO dbo.transfers (reference, owner_user_id, type, idempotency_key, from_account_id, to_account_id, currency, amount_cents, status)
      VALUES (N'neg', @uid, N'TRANSFER', N'neg', @alice, @bob, N'ETB', -100, N'PENDING');`, 'denied'));

const conservation = run(`USE ${DB};
SELECT CONCAT(N'TOTALS|',
  ISNULL((SELECT SUM(amount_cents) FROM dbo.ledger_entries), 0), N'|',
  ISNULL((SELECT SUM(balance_cents) FROM dbo.accounts), 0), N'|',
  (SELECT COUNT(*) FROM dbo.ledger_entries)) AS totals;`);

console.log(`\n${conservation.split('\n').find((l) => l.includes('TOTALS|')).trim()}`);
console.log('\nInvariant checks');
for (const [status, label] of results) console.log(`  ${status === 'PASS' ? 'ok  ' : 'FAIL'} ${label}`);

const failed = results.filter(([s]) => s !== 'PASS').length;
console.log(`\n${results.length - failed} of ${results.length} invariant checks passed`);
process.exitCode = failed ? 1 : 0;
