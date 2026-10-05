# Digital Wallet & Payment System

A multi-currency wallet with peer-to-peer transfers, double-entry bookkeeping, and
real-time balance push. Spring Boot 3.5 on Java 17, Next.js 15 on React 19, MS SQL
Server, JWT (RS256) authentication.

The design rule that shapes everything else: **the ledger is the source of truth, and
the database enforces it.** A balance you see on screen is a cached projection of
immutable entries, and the rules that keep those entries honest are triggers and
grants, not `if` statements that a future code path can forget.

## Layout

```
backend/            Spring Boot service (API, ledger engine, security, scheduler)
  src/main/resources/db/migration/   Flyway: V1 schema, V2 guards, V3 grants, V4 seed
frontend/           Next.js client (App Router, TypeScript, Tailwind, STOMP)
deploy/             provision, migrate-check, run scripts
API.md              the HTTP + WebSocket contract both sides implement
```

## Running it locally

Requires: Java 17, Maven, Node 20+, and a local SQL Server (Express or higher) with
Windows authentication enabled for the account that runs the commands.

1. Start the database service. On Windows:

   ```
   net start MSSQL$SQLEXPRESS
   ```

2. Provision the databases, logins, and the runtime role, and generate the secrets:

   ```
   node deploy/provision.mjs
   ```

   This creates `wallet_db` and `wallet_test`, the `wallet_migrate` and `wallet_app`
   logins, and writes their generated passwords plus two RSA JWT key pairs into
   `backend/.env`. That file is git-ignored and is never printed to a terminal.

3. Verify the migrations and the invariants they install:

   ```
   node deploy/check-migrations.mjs
   ```

   It rebuilds a scratch database, replays every migration, then attacks the ledger:
   unbalanced postings, rewritten history, deleted entries, overdrafts, and fees that
   arrive in the wrong account. It must end with `10 of 10 passed`.

4. Start both halves:

   ```
   node deploy/run.mjs
   ```

   The API is on `:8080`, the client on `:3000`. The script prints the LAN address of
   this machine, which is the URL to open from a phone on the same network, and it
   registers that address as an allowed browser origin with the API. If something else
   on this machine already owns port 3000, move the client with
   `FRONTEND_PORT=3100 node deploy/run.mjs` — the API is told about the new port too.
   To run one half at a time: `node deploy/run.mjs backend` or `... frontend`.

5. Sign up at `http://localhost:3000` (or the printed LAN address). A new customer gets
   three wallets (ETB, USD, EUR) at zero, tier 0 limits, and a pending identity review.
   Use **Add funds** to get money into the system; it is a simulated funding rail
   standing in for a payment provider.

6. Check the running system over the wire, without a browser:

   ```
   node deploy/smoke-api.mjs
   node deploy/smoke-ws.mjs
   ```

   The first signs up two customers, funds one, transfers between them, replays the
   same idempotency key, exports both statement formats, exercises token refresh,
   rate limiting, role isolation, and the reviewer decisions. The second connects over
   STOMP and asserts the balance arrives after the commit rather than before it.
   Both are safe to re-run: every email and idempotency key is generated fresh.

   Reviews are decided by the addresses in `WALLET_REVIEWERS` (`ops@wallet.local` by
   default). Register that address once, and its sessions carry `ROLE_REVIEWER`, which
   is what approves submissions and runs reconciliation on demand.

7. Check the running client in a real browser:

   ```
   UI_URL=http://localhost:3100 node deploy/smoke-ui.mjs
   ```

   It seeds a funded, verified customer over the API, signs in through the login form,
   visits every screen at 1280x900 and 390x844, and walks the five-step transfer wizard
   to a committed transfer. It fails if any screen overflows horizontally, if the review
   step exposes an editable field, if a `/api/` call errors, if the console shows an
   error, or if no transfer reference appears. `API_URL` and `CHROME_PATH` override the
   other ends; screenshots land in your system temp directory, never in the repo.

## Tests

```
node deploy/run.mjs test
```

The integration tests run against `wallet_test` with a real SQL Server, because the
guarantees worth testing are enforced by the database:

- 24 concurrent transfers, half of them reciprocal `A→B` / `B→A`, assert the sum of
  every account in the system is still zero and no wallet went negative.
- A randomised 25-transfer sequence asserts every transfer's entries sum to zero.
- A replayed idempotency key returns the original reference and debits once.
- A single extra leg, an `UPDATE`, and a `DELETE` on `ledger_entries` are all refused.
- Five wrong PINs lock the PIN, and the lockout survives the rollbacks around it.
- Repeated sign-ins are throttled with `429` and a `Retry-After`.

## How the money model works

A transfer posts **four entries** — sender principal, sender fee, fee revenue,
recipient credit — in one multi-row statement, so the statement-level guards in
`V2__ledger_invariants.sql` see the complete set:

| Guard | Refuses |
| --- | --- |
| `50003` | a transfer whose entries do not sum to zero |
| `50004` | debit legs that do not equal amount plus fee |
| `50009` | legs that arrive in accounts other than the transfer's declared parties |
| `50008` | a customer wallet taken below its ledger balance |
| `50007` | promoting a transfer to `COMPLETED` without balanced entries |
| `50001/2` | any update or delete of posted history |

`wallet_app`, the login the service runs as, has `INSERT` on `ledger_entries` and is
`DENY`-ed `UPDATE, DELETE`. Rewriting history would need the migrator identity, which
is only used during a release.

Concurrency: the wallets involved in a transfer are locked `WITH (UPDLOCK, ROWLOCK)` in
ascending account id, which is what makes reciprocal transfers safe. Deadlocks (SQL
Server 1205) are retried at most three times. Shared platform accounts are not locked;
their projection is maintained by an atomic increment so they never become a global
serialization point.

Reconciliation recomputes every account from its entries on a schedule, records whether
it agreed, and freezes outgoing money for any customer whose projection drifted. The
freeze is lifted only by a later run that finds the books in agreement.

## Security

- Access tokens are RS256 JWTs with a `kid`; the key ring holds the current signing key
  and a verify-only previous key, so a rotation does not log anyone out.
  `/api/jwks` publishes both public halves.
- Refresh tokens are single-use, stored as SHA-256 digests, and rotated within a
  family. Presenting a consumed token revokes the whole family.
- Money movement requires a PIN — a second credential, separately hashed. Failures are
  counted outside the money transaction so a rejection cannot roll back its own record.
- Bucket4j limits sign-ins, registrations, PIN-bearing transfers, and quotes.
- `audit_log` records intent and access (who tried, what was denied), never amounts.
- Tier ceilings are applied per currency server-side, and the quote endpoint reports
  remaining daily capacity while the user types.

## Operations notes

- `GET /actuator/health` for liveness.
- Flyway runs at startup with `wallet_migrate`; the app never runs DDL.
- `POST /api/admin/reconcile` (reviewer role) runs the ledger proof on demand;
  `?repair=true` moves a drifted projection to the ledger value. It never edits an
  entry, because entries are the truth.
- Configuration is environment-driven; see `backend/src/main/resources/application.yml`.
