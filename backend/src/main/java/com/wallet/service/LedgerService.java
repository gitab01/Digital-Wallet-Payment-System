package com.wallet.service;

import com.wallet.domain.LedgerEntry;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Writes the ledger.
 *
 * Every leg of a transfer is posted as ONE multi-row INSERT statement, and that is
 * a correctness requirement rather than an optimisation. The database guards in V2
 * are statement-level AFTER INSERT triggers: they evaluate the whole transfer once
 * the statement completes. Four separate INSERT statements would make the first
 * statement an unbalanced transfer by itself, and the guard would reject a correct
 * movement purely because of how it was written.
 */
@Service
public class LedgerService {

    /** One signed movement against one account, with the balance it produced. */
    public record Leg(Long accountId, long amountCents, LedgerEntry.Role role, String currency,
                      long balanceAfterCents) {}

    private static final String INSERT_SQL = buildInsert();

    private final JdbcTemplate jdbc;

    public LedgerService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static String buildInsert() {
        // Placeholders are filled per leg at execution time; the statement shape is
        // fixed so the driver can prepare it once per distinct leg count.
        return "INSERT INTO ledger_entries "
             + "(transfer_id, account_id, amount_cents, entry_role, currency, balance_after_cents) ";    }

    /**
     * @throws org.springframework.dao.DataIntegrityViolationException when the
     *         posting guards reject the set. The caller's transaction rolls back, so
     *         no partial movement can survive.
     */
    public void post(Long transferId, List<Leg> legs) {
        if (legs == null || legs.size() < 2) {
            throw new IllegalArgumentException("A double entry needs at least two legs");
        }

        StringBuilder values = new StringBuilder(" VALUES ");
        Object[] args = new Object[legs.size() * 6];
        int i = 0;

        for (int n = 0; n < legs.size(); n++) {
            Leg leg = legs.get(n);
            if (n > 0) values.append(", ");
            values.append("(?,?,?,?,?,?)");
            args[i++] = transferId;
            args[i++] = leg.accountId();
            args[i++] = leg.amountCents();
            args[i++] = leg.role().name();
            args[i++] = leg.currency();
            args[i++] = leg.balanceAfterCents();
        }

        int written = jdbc.update(INSERT_SQL + values, args);
        if (written != legs.size()) {
            throw new IllegalStateException(
                    "Expected " + legs.size() + " ledger rows, posted " + written);
        }
    }
}
