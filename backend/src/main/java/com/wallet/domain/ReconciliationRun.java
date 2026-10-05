package com.wallet.domain;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * One account's outcome from a reconciliation pass: projection versus the ledger.
 * Rows are the audit trail of the claim "this balance is provable".
 */
@Entity
@Table(name = "reconciliation_runs")
public class ReconciliationRun {

    public enum Outcome { MATCHED, DRIFT, REPAIRED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "account_id", nullable = false)
    private Long accountId;

    @Column(name = "projected_cents", nullable = false)
    private long projectedCents;

    @Column(name = "ledger_cents", nullable = false)
    private long ledgerCents;

    @Column(name = "drift_cents", nullable = false)
    private long driftCents;

    @Enumerated(EnumType.STRING)
    @Column(name = "outcome", nullable = false, length = 16)
    private Outcome outcome;

    @Column(name = "ran_at", nullable = false)
    private Instant ranAt;

    @PrePersist
    void onCreate() {
        ranAt = Instant.now();
    }

    public static ReconciliationRun of(long accountId, long projected, long ledger, Outcome outcome) {
        ReconciliationRun r = new ReconciliationRun();
        r.accountId = accountId;
        r.projectedCents = projected;
        r.ledgerCents = ledger;
        // The schema checks drift = projected - ledger, so it is derived, never typed in.
        r.driftCents = projected - ledger;
        r.outcome = outcome;
        return r;
    }

    public Long getId() { return id; }
    public Long getAccountId() { return accountId; }
    public long getProjectedCents() { return projectedCents; }
    public long getLedgerCents() { return ledgerCents; }
    public long getDriftCents() { return driftCents; }
    public Outcome getOutcome() { return outcome; }
    public Instant getRanAt() { return ranAt; }
}
