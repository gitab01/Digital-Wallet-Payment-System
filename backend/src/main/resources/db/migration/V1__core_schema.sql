-- Core relational model. Money is stored as integer cents, never as a float.
-- There is no mutable balance column that is authoritative: accounts.balance_cents
-- is a projection that is maintained inside the same transaction that writes the
-- ledger entries, and reconciliation can prove it against the ledger at any time.

CREATE TABLE users (
    id                    BIGINT IDENTITY(1,1) NOT NULL,
    email                 NVARCHAR(254)  NOT NULL,
    full_name             NVARCHAR(120)  NOT NULL,
    password_hash         NVARCHAR(100)  NOT NULL,
    pin_hash              NVARCHAR(100)  NOT NULL,
    kyc_tier              TINYINT        NOT NULL CONSTRAINT df_users_tier DEFAULT (0),
    status                NVARCHAR(20)   NOT NULL CONSTRAINT df_users_status DEFAULT (N'ACTIVE'),
    withdrawals_frozen    BIT            NOT NULL CONSTRAINT df_users_frozen DEFAULT (0),
    failed_pin_attempts   INT            NOT NULL CONSTRAINT df_users_pinfail DEFAULT (0),
    pin_locked_until      DATETIME2(3)   NULL,
    created_at            DATETIME2(3)   NOT NULL CONSTRAINT df_users_created DEFAULT (SYSUTCDATETIME()),
    updated_at            DATETIME2(3)   NOT NULL CONSTRAINT df_users_updated DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT pk_users PRIMARY KEY (id),
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT ck_users_tier CHECK (kyc_tier BETWEEN 0 AND 3),
    CONSTRAINT ck_users_status CHECK (status IN (N'PENDING_KYC', N'ACTIVE', N'SUSPENDED', N'CLOSED')),
    -- A frozen account cannot also be in a non-terminal status without a reason,
    -- and a PIN lock must carry the time it expires.
    CONSTRAINT ck_users_pinlock CHECK (pin_locked_until IS NULL OR failed_pin_attempts > 0)
);

CREATE TABLE accounts (
    id                 BIGINT IDENTITY(1,1) NOT NULL,
    -- NULL only for system accounts (cash-in provider, fee revenue).
    user_id            BIGINT         NULL,
    currency           NVARCHAR(3)    NOT NULL,
    kind               NVARCHAR(24)   NOT NULL,
    label              NVARCHAR(60)   NOT NULL,
    balance_cents      BIGINT         NOT NULL CONSTRAINT df_accounts_balance DEFAULT (0),
    version            INT            NOT NULL CONSTRAINT df_accounts_version DEFAULT (0),
    created_at         DATETIME2(3)   NOT NULL CONSTRAINT df_accounts_created DEFAULT (SYSUTCDATETIME()),
    projection_at      DATETIME2(3)   NULL,
    CONSTRAINT pk_accounts PRIMARY KEY (id),
    CONSTRAINT fk_accounts_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT ck_accounts_currency CHECK (currency IN (N'ETB', N'USD', N'EUR')),
    CONSTRAINT ck_accounts_kind CHECK (kind IN (N'CUSTOMER_WALLET', N'CASH_IN_PROVIDER', N'FEE_REVENUE')),
    -- Customer wallets may never go negative: overdrafts are a product decision,
    -- not an accident. System accounts are debited by design, so they are exempt.
    CONSTRAINT ck_accounts_customer_nonnegative CHECK (
        kind <> N'CUSTOMER_WALLET' OR balance_cents >= 0
    ),
    -- A customer wallet always belongs to exactly one user; a system account to none.
    CONSTRAINT ck_accounts_ownership CHECK (
        (kind = N'CUSTOMER_WALLET' AND user_id IS NOT NULL)
        OR (kind <> N'CUSTOMER_WALLET' AND user_id IS NULL)
    )
);

CREATE UNIQUE INDEX uq_accounts_owner_currency
    ON accounts (user_id, currency)
    WHERE user_id IS NOT NULL AND kind = N'CUSTOMER_WALLET';

CREATE UNIQUE INDEX uq_accounts_system_currency
    ON accounts (kind, currency)
    WHERE user_id IS NULL;

CREATE TABLE transfers (
    id                BIGINT IDENTITY(1,1) NOT NULL,
    reference         NVARCHAR(40)   NOT NULL,
    owner_user_id     BIGINT         NOT NULL,
    type              NVARCHAR(16)   NOT NULL,
    -- Retried requests must collapse onto one transfer, so the key is unique at
    -- the database level rather than checked in application code.
    idempotency_key   NVARCHAR(80)   NOT NULL,
    from_account_id   BIGINT         NULL,
    to_account_id     BIGINT         NULL,
    fee_account_id    BIGINT         NULL,
    currency          NVARCHAR(3)    NOT NULL,
    amount_cents      BIGINT         NOT NULL,
    fee_cents         BIGINT         NOT NULL CONSTRAINT df_transfers_fee DEFAULT (0),
    status            NVARCHAR(16)   NOT NULL CONSTRAINT df_transfers_status DEFAULT (N'PENDING'),
    anomaly_score     DECIMAL(7,4)   NULL,
    review_flag       BIT            NOT NULL CONSTRAINT df_transfers_review DEFAULT (0),
    initiated_at      DATETIME2(3)   NOT NULL CONSTRAINT df_transfers_initiated DEFAULT (SYSUTCDATETIME()),
    completed_at      DATETIME2(3)   NULL,
    CONSTRAINT pk_transfers PRIMARY KEY (id),
    CONSTRAINT fk_transfers_owner FOREIGN KEY (owner_user_id) REFERENCES users (id),
    CONSTRAINT fk_transfers_from FOREIGN KEY (from_account_id) REFERENCES accounts (id),
    CONSTRAINT fk_transfers_to FOREIGN KEY (to_account_id) REFERENCES accounts (id),
    CONSTRAINT fk_transfers_fee FOREIGN KEY (fee_account_id) REFERENCES accounts (id),
    CONSTRAINT ck_transfers_type CHECK (type IN (N'TRANSFER', N'DEPOSIT', N'WITHDRAWAL')),
    CONSTRAINT ck_transfers_status CHECK (status IN (N'PENDING', N'COMPLETED', N'REVERSED', N'FAILED')),
    CONSTRAINT ck_transfers_amount CHECK (amount_cents > 0),
    CONSTRAINT ck_transfers_fee CHECK (fee_cents >= 0),
    CONSTRAINT ck_transfers_currency CHECK (currency IN (N'ETB', N'USD', N'EUR')),
    -- A transfer that moves money between two wallets must have two distinct sides.
    -- Deposits and withdrawals supply exactly one customer side plus one system side.
    CONSTRAINT ck_transfers_distinct CHECK (from_account_id IS NULL OR to_account_id IS NULL OR from_account_id <> to_account_id)
);

CREATE UNIQUE INDEX uq_transfers_idempotency
    ON transfers (owner_user_id, idempotency_key);

CREATE UNIQUE INDEX uq_transfers_reference ON transfers (reference);

CREATE INDEX ix_transfers_owner_initiated
    ON transfers (owner_user_id, initiated_at DESC)
    INCLUDE (type, amount_cents, currency, status);

CREATE TABLE ledger_entries (
    id                  BIGINT IDENTITY(1,1) NOT NULL,
    -- Every entry is caused by a transfer. An entry with no transfer is an
    -- unexplained movement of money, so it is not representable.
    transfer_id         BIGINT         NOT NULL,
    account_id          BIGINT         NOT NULL,
    -- Signed delta applied to this account: negative means money left the account.
    -- Summing the signed deltas of one transfer therefore IS the conservation test,
    -- so the zero-sum guard needs no debit/credit bookkeeping rules.
    amount_cents        BIGINT         NOT NULL,
    entry_role          NVARCHAR(16)   NOT NULL,
    currency            NVARCHAR(3)    NOT NULL,
    balance_after_cents BIGINT         NOT NULL,
    created_at          DATETIME2(3)   NOT NULL CONSTRAINT df_entries_created DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT pk_ledger_entries PRIMARY KEY (id),
    CONSTRAINT fk_entries_transfer FOREIGN KEY (transfer_id) REFERENCES transfers (id),
    CONSTRAINT fk_entries_account FOREIGN KEY (account_id) REFERENCES accounts (id),
    CONSTRAINT ck_entries_nonzero CHECK (amount_cents <> 0),
    CONSTRAINT ck_entries_role CHECK (entry_role IN (N'FROM', N'TO', N'FEE', N'FEE_REVENUE', N'CASH_IN', N'CASH_OUT')),
    CONSTRAINT ck_entries_currency CHECK (currency IN (N'ETB', N'USD', N'EUR'))
);

-- Statement and history queries are the hottest reads in the system. This index
-- makes them index-only scans: seek on the account, walk in date order, and read
-- the payload from the leaf without touching the base table.
CREATE INDEX ix_entries_account_created
    ON ledger_entries (account_id, created_at DESC)
    INCLUDE (transfer_id, amount_cents, currency, entry_role, balance_after_cents);

CREATE INDEX ix_entries_transfer ON ledger_entries (transfer_id);

CREATE TABLE kyc_records (
    id             BIGINT IDENTITY(1,1) NOT NULL,
    user_id        BIGINT        NOT NULL,
    tier           TINYINT       NOT NULL,
    document_type  NVARCHAR(24)  NOT NULL,
    -- The document number is only ever needed to prove the record to a regulator,
    -- so the plaintext is never stored: a hash is enough to detect reuse.
    document_hash  CHAR(64)      NOT NULL,
    document_last4 NVARCHAR(4)   NOT NULL,
    phone          NVARCHAR(24)  NOT NULL,
    date_of_birth  DATE          NOT NULL,
    country        NVARCHAR(2)   NOT NULL,
    status         NVARCHAR(16)  NOT NULL CONSTRAINT df_kyc_status DEFAULT (N'SUBMITTED'),
    submitted_at   DATETIME2(3)  NOT NULL CONSTRAINT df_kyc_submitted DEFAULT (SYSUTCDATETIME()),
    reviewed_at    DATETIME2(3)  NULL,
    CONSTRAINT pk_kyc PRIMARY KEY (id),
    CONSTRAINT fk_kyc_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT ck_kyc_tier CHECK (tier BETWEEN 1 AND 3),
    CONSTRAINT ck_kyc_status CHECK (status IN (N'SUBMITTED', N'APPROVED', N'REJECTED')),
    -- One document may only back one identity, at most one record per tier.
    CONSTRAINT uq_kyc_document UNIQUE (document_hash, tier)
);

CREATE INDEX ix_kyc_user ON kyc_records (user_id);

CREATE TABLE tier_limits (
    tier                  TINYINT  NOT NULL,
    per_transaction_cents BIGINT   NOT NULL,
    daily_cents           BIGINT   NOT NULL,
    monthly_cents         BIGINT   NOT NULL,
    allows_withdrawal     BIT      NOT NULL CONSTRAINT df_limits_withdraw DEFAULT (0),
    CONSTRAINT pk_tier_limits PRIMARY KEY (tier),
    CONSTRAINT ck_limits_tier CHECK (tier BETWEEN 0 AND 3),
    CONSTRAINT ck_limits_positive CHECK (per_transaction_cents > 0 AND daily_cents > 0 AND monthly_cents > 0)
);

CREATE TABLE audit_log (
    id          BIGINT IDENTITY(1,1) NOT NULL,
    user_id     BIGINT        NULL,
    action      NVARCHAR(40)  NOT NULL,
    outcome     NVARCHAR(16)  NOT NULL,
    ip_address  NVARCHAR(45)  NULL,
    user_agent  NVARCHAR(256) NULL,
    detail      NVARCHAR(512) NULL,
    created_at  DATETIME2(3)  NOT NULL CONSTRAINT df_audit_created DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT pk_audit PRIMARY KEY (id),
    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT ck_audit_outcome CHECK (outcome IN (N'SUCCESS', N'DENIED', N'FAILED'))
);

CREATE INDEX ix_audit_user_created ON audit_log (user_id, created_at DESC);
CREATE INDEX ix_audit_action_created ON audit_log (action, created_at DESC);

CREATE TABLE refresh_tokens (
    id          BIGINT IDENTITY(1,1) NOT NULL,
    user_id     BIGINT       NOT NULL,
    -- Only the digest is stored; a database dump cannot be replayed as a session.
    token_hash  CHAR(64)     NOT NULL,
    family_id   UNIQUEIDENTIFIER NOT NULL,
    issued_at   DATETIME2(3) NOT NULL CONSTRAINT df_refresh_issued DEFAULT (SYSUTCDATETIME()),
    expires_at  DATETIME2(3) NOT NULL,
    revoked_at  DATETIME2(3) NULL,
    replaced_by BIGINT       NULL,
    CONSTRAINT pk_refresh PRIMARY KEY (id),
    CONSTRAINT uq_refresh_hash UNIQUE (token_hash),
    CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE INDEX ix_refresh_family ON refresh_tokens (family_id);

CREATE TABLE reconciliation_runs (
    id              BIGINT IDENTITY(1,1) NOT NULL,
    account_id      BIGINT       NOT NULL,
    projected_cents BIGINT       NOT NULL,
    ledger_cents    BIGINT       NOT NULL,
    drift_cents     BIGINT       NOT NULL,
    outcome         NVARCHAR(16) NOT NULL,
    ran_at          DATETIME2(3) NOT NULL CONSTRAINT df_recon_ran DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT pk_reconciliation PRIMARY KEY (id),
    CONSTRAINT fk_recon_account FOREIGN KEY (account_id) REFERENCES accounts (id),
    CONSTRAINT ck_recon_outcome CHECK (outcome IN (N'MATCHED', N'DRIFT', N'REPAIRED')),
    CONSTRAINT ck_recon_drift CHECK (drift_cents = projected_cents - ledger_cents)
);

CREATE INDEX ix_recon_account_ran ON reconciliation_runs (account_id, ran_at DESC);

CREATE TABLE app_state (
    [key]       NVARCHAR(64) NOT NULL,
    [value]     NVARCHAR(256) NOT NULL,
    updated_at  DATETIME2(3) NOT NULL CONSTRAINT df_state_updated DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT pk_app_state PRIMARY KEY ([key])
);
