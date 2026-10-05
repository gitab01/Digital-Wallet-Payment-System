# Digital Wallet — HTTP + WebSocket contract

Single source of truth for both the Spring Boot service and the Next.js client.
If code and this file disagree, this file is right.

Money is a JSON **string** with exactly two decimals (`"1234.56"`) and a separate
ISO `currency` code (`ETB`, `USD`, `EUR`). The client must never parse money into
a float for arithmetic; display only. Cents are an internal storage detail.

Base URL: `http://localhost:8080` in development. All routes below are prefixed
with `/api`. Authenticated routes need `Authorization: Bearer <accessToken>`.

## Error shape

Every non-2xx response is:

```json
{ "code": "INSUFFICIENT_FUNDS", "message": "...", "details": {}, "traceId": "..." }
```

`code` is stable and machine-readable; the client switches on it. HTTP status:

| Status | Codes |
| --- | --- |
| 400 | `VALIDATION_FAILED`, `PIN_REQUIRED`, `INVALID_AMOUNT`, `INVALID_DATE` |
| 401 | `AUTH_REQUIRED`, `BAD_CREDENTIALS`, `TOKEN_EXPIRED`, `PIN_INVALID` |
| 403 | `WITHDRAWALS_FROZEN`, `ACCOUNT_NOT_ACTIVE`, `LIMIT_EXCEEDED`, `PIN_LOCKED` |
| 404 | `ACCOUNT_NOT_FOUND`, `USER_NOT_FOUND`, `TRANSFER_NOT_FOUND` |
| 409 | `ALREADY_ONBOARDED`, `SELF_TRANSFER`, `CURRENCY_MISMATCH`, `INSUFFICIENT_FUNDS` |
| 429 | `RATE_LIMITED` (send `Retry-After` seconds) |

## Auth

### `POST /api/auth/register`
Create a customer, their wallets, and their KYC submission. No auth.

```json
{ "email": "a@b.co", "fullName": "Abel Assefa", "password": "...", "pin": "4321",
  "phone": "+251900000000", "dateOfBirth": "1996-04-02", "country": "ET",
  "documentType": "NATIONAL_ID", "documentNumber": "AB1234567" }
```

`pin` is exactly 4 digits, `dateOfBirth` is `yyyy-MM-dd`, `country` is a 2-letter
code, and every field in the payload above is required: the KYC submission the call
creates stores them. Response `201`:

```json
{ "user": { "id": 1, "email": "a@b.co", "fullName": "...", "kycTier": 0, "status": "PENDING_KYC" },
  "tokens": { "accessToken": "...", "refreshToken": "...", "expiresIn": 900, "tokenType": "Bearer" } }
```

Errors: `VALIDATION_FAILED`, `EMAIL_TAKEN` (409).

### `POST /api/auth/login`
`{ "email": "...", "password": "..." }` → `200` same `tokens` shape plus `user`.
Errors: `BAD_CREDENTIALS`, `RATE_LIMITED`, `ACCOUNT_NOT_ACTIVE` (403).

### `POST /api/auth/refresh`
`{ "refreshToken": "..." }` → `200` new `tokens`. Reuse of an already-rotated token
revokes the whole family and returns `401 TOKEN_EXPIRED`.

### `POST /api/auth/logout`
`{ "refreshToken": "..." }` → `204`. Revokes the family.

## Wallet

### `GET /api/wallet`
Everything the home screen needs in one round trip.

```json
{
  "accounts": [{
    "id": 4, "currency": "ETB", "label": "ETB wallet",
    "balance": "1500.00", "available": "1500.00",
    "verifiedAt": "2026-10-05T03:10:00Z", "reconciled": true
  }],
  "tier": 2,
  "limits": {
    "perTransaction": "250000.00", "daily": "500000.00", "monthly": "2000000.00",
    "spentToday": "1200.00", "spentThisMonth": "45000.00",
    "remainingToday": "498800.00", "allowsWithdrawal": true
  },
  "withdrawalsFrozen": false,
  "recent": [{ "reference": "WLT-7K3Q...", "type": "TRANSFER", "direction": "OUT",
               "currency": "ETB", "amount": "250.00", "fee": "2.50",
               "status": "COMPLETED", "occurredAt": "2026-10-05T03:00:00Z",
               "counterparty": "Bob", "reviewFlag": false }]
}
```

`reconciled` is the "verified" indicator: the last time the projection for that
account was proved against the ledger.

### `POST /api/accounts`
Open another currency wallet. `{ "currency": "USD" }` → `201` account. `409` if it
already exists (one wallet per currency per user).

## Transfers

### `GET /api/transfers/quote`
Pre-flight check used live while the user types. Auth required; **no PIN**.

Query: `toEmail`, `currency`, `amount`

```json
{ "recipientName": "Bob Two", "fee": "2.50", "totalDebit": "252.50",
  "senderBalanceAfter": "1247.50", "recipientBalanceAfter": "250.00",
  "remainingToday": "497550.00", "allowed": true, "reason": null }
```

`allowed: false` with `reason` = `INSUFFICIENT_FUNDS` | `LIMIT_EXCEEDED` |
`CURRENCY_MISMATCH` | `SELF_TRANSFER` | `WITHDRAWALS_FROZEN`.

### `POST /api/transfers`
Execute a peer-to-peer transfer.

```json
{ "toEmail": "b@b.co", "currency": "ETB", "amount": "250.00",
  "pin": "4321", "idempotencyKey": "8f2a…-uuid" }
```

`idempotencyKey` is generated **once per wizard session** on the client and reused
on retry. A repeat returns the original result with `200` and `replayed: true`.

```json
{ "reference": "WLT-7K3QF2M9", "status": "COMPLETED", "replayed": false,
  "amount": "250.00", "fee": "2.50", "currency": "ETB",
  "occurredAt": "2026-10-05T03:00:00Z", "reviewFlag": false,
  "senderBalance": "1247.50", "recipientName": "Bob Two" }
```

Errors: `PIN_INVALID` (401, `details.attemptsLeft`), `PIN_LOCKED` (403,
`details.unlockedAt`), `INSUFFICIENT_FUNDS`, `LIMIT_EXCEEDED`
(`details.limit`, `details.spent`), `WITHDRAWALS_FROZEN`, `SELF_TRANSFER`,
`CURRENCY_MISMATCH`, `RATE_LIMITED`.

The client must not show a new balance until this call returns. There is no
optimistic balance.

### `POST /api/funds/deposit` and `POST /api/funds/withdraw`
Simulated funding rails (a real deployment would swap these for a PSP). Same body
shape as a transfer but `amount` only, plus `pin` and `idempotencyKey`. Returns the
transfer result. Withdrawal requires a tier that allows it.

## History and statements

### `GET /api/transactions?accountId=&from=&to=&page=&size=`
Page of `{ items: [ { reference, type, direction, currency, amount, fee, status,
occurredAt, counterparty, reviewFlag, ledgerEntryIds: [1,2,3,4] } ], total, page, size }`.

### `GET /api/transactions/{reference}`
Full detail: the fields above plus `senderAccountId`, `recipientAccountId`,
`initiatedAt`, `completedAt`, `anomalyScore`, and `entries[]` of
`{ id, accountId, accountLabel, amount, role, balanceAfter, createdAt }`.

### `GET /api/statements?accountId=&from=&to=&format=csv|pdf`
Streams a file with `Content-Disposition: attachment`. CSV is UTF-8 with a BOM so
Excel opens it correctly.

## KYC

### `GET /api/kyc`
`{ "tier": 2, "status": "APPROVED", "submittedAt": "...", "reviewedAt": "...",
   "documents": [ { "tier": 1, "documentType": "NATIONAL_ID", "last4": "4567",
                    "status": "APPROVED", "submittedAt": "..." } ],
   "limits": { ... }, "nextTier": 3 }`

### `POST /api/kyc`
Upgrade submission: `{ "documentType": "PASSPORT", "documentNumber": "...",
"phone": "+251…", "dateOfBirth": "1996-04-02", "country": "ET" }` → `201`.

### `POST /api/kyc/{id}/decision`
Operations-only (`ROLE_REVIEWER`): `{ "approve": true }` → `200`. Drives tier and
limits. Used to demo tiered limits locally.

## Security settings

### `POST /api/me/pin`
`{ "currentPin": "4321", "newPin": "9876" }` → `204`.

### `GET /api/me/audit`
Recent security events: `{ items: [ { action, outcome, ipAddress, createdAt,
detail } ] }`. Actions include `LOGIN`, `PIN_FAILURE`, `LIMIT_BREACH`, `TRANSFER`.

## WebSocket

STOMP over `ws://localhost:8080/ws`, `Authorization: Bearer <accessToken>` sent as a
connect header. Subscribe to:

- `/user/queue/balances` → `{ accountId, currency, balance, available, verifiedAt,
  reference, occurredAt }` after each committed movement.
- `/user/queue/transactions` → the transaction row behind a new movement.

Messages are published only in an `afterCommit` synchronisation, so a rolled-back
transfer can never push a balance. If the socket is down the client falls back to
`GET /api/wallet`, and a manual refresh control is always present.

## Health

`GET /actuator/health` → `{ status: "UP" }`.
