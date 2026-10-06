# Mela Wallet — HTTP + WebSocket contract

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

`documentType` is one of `NATIONAL_ID`, `PASSPORT`, `DRIVING_LICENSE`. A national ID
and a licence are read on both sides, so both images are required; a passport is
verified from its single information page, so only `FRONT` is required.

### `GET /api/kyc`
`{ "tier": 2, "status": "APPROVED", "submittedAt": "...", "reviewedAt": "...",
   "documents": [ { "tier": 1, "recordId": 7, "documentType": "NATIONAL_ID", "last4": "4567",
                    "status": "SUBMITTED", "submittedAt": "...",
                    "sides": { "FRONT": 12, "BACK": null } } ],
   "limits": { ... }, "nextTier": 3 }`

`sides` maps each side to the stored document id, or `null` when it has not been
uploaded, which is what the client uses to decide whether to show a picker or a tick.

### `POST /api/kyc`
Upgrade submission: `{ "documentType": "PASSPORT", "documentNumber": "...",
"phone": "+251…", "dateOfBirth": "1996-04-02", "country": "ET" }` → `201`.

### `POST /api/kyc/documents`
`multipart/form-data`, authenticated, one file per call:

| Part | Value |
| --- | --- |
| `side` | `FRONT` or `BACK` |
| `file` | JPEG or PNG, at most 8 MB |

Attaches the image to the caller's newest `SUBMITTED` submission; uploading a side
that already exists replaces it. Response `201`:

```json
{ "id": 12, "recordId": 7, "side": "FRONT", "byteLength": 249113, "uploadedAt": "..." }
```

What is stored is not quite what was sent: the bytes are decoded and re-encoded as
JPEG, capped at 1600px on the long edge. That removes EXIF (which carries the camera's
GPS fix), removes anything appended after the image data, and means a review desk can
never be served a file that is a valid image and a valid something else at once.
Errors: `VALIDATION_FAILED`, `UNSUPPORTED_IMAGE` (400), `FILE_TOO_LARGE` (413),
`NO_OPEN_SUBMISSION` (409), `RATE_LIMITED`.

### `GET /api/kyc/documents/{id}/image`
`image/jpeg`, `Cache-Control: no-store`. The owner of the submission, or a reviewer.
Every read is audited, because an identity photograph is personal data and "who looked
at it" has to be answerable.

### `POST /api/kyc/{id}/decision`
Operations-only (`ROLE_REVIEWER`): `{ "approve": true }` → `200`. Drives tier and
limits. Used to demo tiered limits locally.

Approval is refused while a required side is missing: `DOCUMENTS_INCOMPLETE` (409),
with the missing sides in `details`. A submission can therefore never be approved on
the document number alone.

## Operations console

All `ROLE_REVIEWER`. A reviewer is an account whose e-mail is in `wallet.reviewers`;
reviewers cannot approve their own submissions.

### `GET /api/admin/kyc-queue`
```json
[ { "recordId": 7, "userId": 3, "tier": 1, "email": "a@b.co", "fullName": "...",
    "documentType": "NATIONAL_ID", "last4": "4567", "submittedAt": "...",
    "missing": ["BACK"], "duplicateOfUserId": null, "ownSubmission": false } ]
```

`duplicateOfUserId` is set when another customer has already filed a scan with the
same pixel content — the shape of an identity farm, and the reason the review desk
needs to see the images rather than only the numbers.

### `GET /api/admin/clients?query=&status=&page=&size=`
`query` matches an e-mail or name fragment. Balances are per currency, never summed
across them.

```json
{ "items": [ { "id": 3, "email": "a@b.co", "fullName": "...", "kycTier": 1,
               "status": "ACTIVE", "withdrawalsFrozen": false, "createdAt": "...",
               "wallets": [ { "currency": "ETB", "balance": "757.07" } ] } ],
  "total": 41, "page": 0, "size": 20 }
```

### `GET /api/admin/clients/{id}`
The whole customer in one read: `{ "user": { ...as above, "failedPinAttempts": 0,
"pinLockedUntil": null }, "wallets": [...], "limits": { ... }, "kyc": [ ...submissions
with their `sides`... ], "recent": [ ...transaction rows... ] }`.

### `POST /api/admin/clients/{id}/status`
`{ "status": "SUSPENDED" }` or `{ "status": "ACTIVE" }` → `200` the user view.
A suspended account cannot sign in or move money.

### `POST /api/admin/clients/{id}/withdrawal-freeze`
`{ "frozen": true }` → `200`. Stops cash-out while leaving transfers and top-ups
working, which is the narrower response to a suspicious but unproven account.

### `POST /api/admin/clients/{id}/pin-unlock`
→ `204`. Clears a PIN lockout for a customer who has proven themselves out of band.

### `GET /api/admin/audit?action=&page=&size=`
`{ "items": [ { "id": 991, "userEmail": "a@b.co", "action": "KYC_DOCUMENT_VIEWED",
"outcome": "SUCCESS", "ipAddress": "0:0:0:0:0:0:0:1", "createdAt": "...",
"detail": "document 12" } ], "total": 991, "page": 0, "size": 50 }`

### `POST /api/admin/reconcile?repair=false`
Runs the ledger proof on demand; `repair=true` moves a projection to match the ledger.

`GET /api/admin/kyc/{recordId}/documents` returns the images attached to a submission
`[{ "id": 12, "side": "FRONT", "byteLength": 249113, "uploadedAt": "..." }]`, and a
reviewer fetches the bytes from the same
`GET /api/kyc/documents/{id}/image` route the owner uses.

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
