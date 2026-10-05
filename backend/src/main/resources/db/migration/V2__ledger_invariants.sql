-- Invariant guards. These live in the database on purpose: an application bug, a
-- bad migration or a compromised service must all fail the same way, by being
-- rejected by the engine rather than by convention.
--
-- Each guard raises a severity-16 error, which aborts the offending statement and
-- dooms the surrounding transaction; the service layer then rolls back.

-- 1. History cannot be rewritten. Append-only applies to every principal, including
--    dbo, so a bug in the service cannot silently edit or erase a posted entry.
CREATE OR ALTER TRIGGER dbo.trg_ledger_no_update
ON dbo.ledger_entries
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    ;THROW 50001, 'ledger_entries is append-only: UPDATE of a posted entry is not permitted.', 16;
END;
GO

CREATE OR ALTER TRIGGER dbo.trg_ledger_no_delete
ON dbo.ledger_entries
AFTER DELETE
AS
BEGIN
    SET NOCOUNT ON;
    ;THROW 50002, 'ledger_entries is append-only: DELETE is not permitted. Post a reversing transfer instead.', 16;
END;
GO

-- 2. Everything an entry posting must satisfy, in one place so the checks cannot
--    be reordered against each other.
CREATE OR ALTER TRIGGER dbo.trg_ledger_posting_guard
ON dbo.ledger_entries
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;

    -- 2a. Money is neither created nor destroyed: the entries of one transfer must
    --     sum to exactly zero. Evaluated over every entry of any transfer touched
    --     by the statement, so a partial insert of an unbalanced set fails too.
    IF EXISTS (
        SELECT 1
        FROM (SELECT DISTINCT transfer_id FROM inserted) touched
        JOIN dbo.ledger_entries e ON e.transfer_id = touched.transfer_id
        GROUP BY touched.transfer_id
        HAVING SUM(e.amount_cents) <> 0
    )
    BEGIN
        THROW 50003, 'Unbalanced transfer: the ledger entries of a transfer must sum to zero.', 16;
    END

    -- 2b. The debit legs must equal the transfer principal plus its fee, so a fee
    --     cannot be charged without a matching revenue credit, and money cannot
    --     leave a wallet without a transfer that accounts for the whole of it.
    IF EXISTS (
        SELECT 1
        FROM (SELECT DISTINCT transfer_id FROM inserted) touched
        JOIN dbo.transfers t ON t.id = touched.transfer_id
        WHERE (SELECT SUM(-e.amount_cents)
               FROM dbo.ledger_entries e
               WHERE e.transfer_id = touched.transfer_id
                 AND e.amount_cents < 0) <> t.amount_cents + t.fee_cents
    )
    BEGIN
        THROW 50004, 'Debit legs of a transfer must equal its amount plus fee.', 16;
    END

    -- 2c. A customer wallet cannot be driven below zero. Because a wallet starts at
    --     zero and every later movement is an entry, the running sum of its entries
    --     is its lifetime balance, so this is the overdraft guard at the ledger level
    --     rather than only on the cached projection.
    IF EXISTS (
        SELECT 1
        FROM (SELECT DISTINCT account_id FROM inserted) touched
        JOIN dbo.accounts a ON a.id = touched.account_id AND a.kind = N'CUSTOMER_WALLET'
        WHERE (SELECT SUM(e.amount_cents)
               FROM dbo.ledger_entries e
               WHERE e.account_id = touched.account_id) < 0
    )
    BEGIN
        THROW 50008, 'A customer wallet may not be debited below its ledger balance.', 16;
    END

    -- 2d. The legs must land where the transfer says they land. Zero sum and a
    --     correct debit total cannot catch a fee that quietly arrives in the
    --     recipient's wallet instead of fee revenue, so each declared party is
    --     checked against its own expected total. Parties a transfer type does
    --     not use are NULL on the transfer and are skipped.
    IF EXISTS (
        SELECT 1
        FROM (SELECT DISTINCT transfer_id FROM inserted) touched
        JOIN dbo.transfers t ON t.id = touched.transfer_id
        WHERE (t.to_account_id IS NOT NULL AND
               ISNULL((SELECT SUM(e.amount_cents) FROM dbo.ledger_entries e
                       WHERE e.transfer_id = t.id AND e.account_id = t.to_account_id), 0)
               <> t.amount_cents)
           OR (t.from_account_id IS NOT NULL AND
               ISNULL((SELECT SUM(e.amount_cents) FROM dbo.ledger_entries e
                       WHERE e.transfer_id = t.id AND e.account_id = t.from_account_id), 0)
               <> -(t.amount_cents + t.fee_cents))
           OR (t.fee_account_id IS NOT NULL AND
               ISNULL((SELECT SUM(e.amount_cents) FROM dbo.ledger_entries e
                       WHERE e.transfer_id = t.id AND e.account_id = t.fee_account_id), 0)
               <> t.fee_cents)
    )
    BEGIN
        THROW 50009, 'Transfer legs must match its declared amount, fee and party accounts.', 16;
    END
END;
GO

-- 3. A transfer is promoted to COMPLETED only if its ledger actually backs it.
--    Transfers are inserted as PENDING and promoted after their entries are
--    posted, so a crash between the two can never be read as money that moved.
CREATE OR ALTER TRIGGER dbo.trg_transfer_completion
ON dbo.transfers
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (SELECT 1 FROM inserted WHERE status = N'COMPLETED')
       AND EXISTS (
            SELECT 1
            FROM inserted i
            WHERE i.status = N'COMPLETED'
              AND NOT EXISTS (
                  SELECT 1
                  FROM dbo.ledger_entries e
                  WHERE e.transfer_id = i.id
                  GROUP BY e.transfer_id
                  HAVING COUNT(*) >= 2 AND SUM(e.amount_cents) = 0
              )
        )
    BEGIN
        THROW 50007, 'A transfer cannot be COMPLETED without balanced ledger entries.', 16;
    END
END;
GO
