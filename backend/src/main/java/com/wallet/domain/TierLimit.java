package com.wallet.domain;

import jakarta.persistence.*;

/** Ceilings for a verification tier. Read-only at runtime; seeded by migration. */
@Entity
@Table(name = "tier_limits")
public class TierLimit {

    @Id
    @Column(name = "tier", nullable = false)
    private int tier;

    @Column(name = "per_transaction_cents", nullable = false)
    private long perTransactionCents;

    @Column(name = "daily_cents", nullable = false)
    private long dailyCents;

    @Column(name = "monthly_cents", nullable = false)
    private long monthlyCents;

    @Column(name = "allows_withdrawal", nullable = false)
    private boolean allowsWithdrawal;

    public int getTier() { return tier; }
    public long getPerTransactionCents() { return perTransactionCents; }
    public long getDailyCents() { return dailyCents; }
    public long getMonthlyCents() { return monthlyCents; }
    public boolean isAllowsWithdrawal() { return allowsWithdrawal; }
}
