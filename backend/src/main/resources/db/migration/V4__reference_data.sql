-- Reference data that the money model cannot work without: tier ceilings and the
-- two system accounts every transfer needs a counterparty in.
--
-- Counterparties matter because double entry has no other way to express "money
-- arrived from outside" or "the platform earned a fee" -- both need a real account
-- on the far side of the entry, so no amount is ever posted into the void.

-- Tier 0 is a signup with a confirmed e-mail only; it can receive and can send
-- small amounts, but cannot withdraw cash, so a stolen password alone cannot
-- leave the system with money.
INSERT INTO dbo.tier_limits
    (tier, per_transaction_cents, daily_cents, monthly_cents, allows_withdrawal)
VALUES
    (0,     500000,   1000000,    2500000, 0),
    (1,    5000000,  10000000,   40000000, 1),
    (2,   25000000,  50000000,  200000000, 1),
    (3,  100000000, 200000000, 1000000000, 1);

-- One settlement source and one fee sink per supported currency.
INSERT INTO dbo.accounts (user_id, currency, kind, label, balance_cents)
SELECT NULL, c.currency, N'CASH_IN_PROVIDER', N'Provider settlement ' + c.currency, 0
FROM (VALUES (N'ETB'), (N'USD'), (N'EUR')) AS c(currency);

INSERT INTO dbo.accounts (user_id, currency, kind, label, balance_cents)
SELECT NULL, c.currency, N'FEE_REVENUE', N'Fee revenue ' + c.currency, 0
FROM (VALUES (N'ETB'), (N'USD'), (N'EUR')) AS c(currency);

-- The projection of a system account is the negation of everything it has ever
-- posted, so a freshly seeded account reconciles at zero by construction.
INSERT INTO dbo.app_state ([key], [value])
VALUES (N'schema_baseline', N'1'),
       (N'ledger_repaired_at', N'none');
