-- Privilege model. The runtime identity is deliberately weaker than the identity
-- that owns the schema: it cannot rewrite ledger history even if it is fully
-- compromised, because the engine has no grant for it to use.
--
-- wallet_migrate (Flyway, release-time only) is db_owner and created the objects.
-- wallet_app is a member of the wallet_runtime role and gets data access only.

GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.users               TO wallet_runtime;
GRANT SELECT, INSERT, UPDATE         ON dbo.accounts           TO wallet_runtime;
GRANT SELECT, INSERT, UPDATE         ON dbo.transfers          TO wallet_runtime;
GRANT SELECT, INSERT                 ON dbo.audit_log          TO wallet_runtime;
GRANT SELECT, INSERT, UPDATE         ON dbo.kyc_records        TO wallet_runtime;
GRANT SELECT, INSERT, UPDATE         ON dbo.refresh_tokens     TO wallet_runtime;
GRANT SELECT, INSERT                 ON dbo.reconciliation_runs TO wallet_runtime;
GRANT SELECT, INSERT, UPDATE         ON dbo.app_state          TO wallet_runtime;
GRANT SELECT                         ON dbo.tier_limits         TO wallet_runtime;
GO

-- The ledger is append-only for the runtime role. DENY wins over any GRANT the
-- role may acquire later, and unlike a check in application code this cannot be
-- bypassed by a code path that forgot to ask.
GRANT SELECT, INSERT ON dbo.ledger_entries TO wallet_runtime;
DENY  UPDATE, DELETE ON dbo.ledger_entries TO wallet_runtime;
GO

-- Foreign keys are covered by ownership chaining, but the grant is stated so the
-- permission model does not depend on every table keeping the same owner.
GRANT REFERENCES ON dbo.users      TO wallet_runtime;
GRANT REFERENCES ON dbo.accounts   TO wallet_runtime;
GRANT REFERENCES ON dbo.transfers  TO wallet_runtime;
GO
