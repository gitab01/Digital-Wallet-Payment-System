package com.wallet.domain;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * One signed movement of money on one account, caused by exactly one transfer.
 *
 * Append-only: the runtime role holds SELECT and INSERT only, and the database
 * rejects UPDATE and DELETE for every principal. Correcting a mistake means
 * posting a reversing transfer, never editing history.
 */
@Entity
@Table(name = "ledger_entries")
public class LedgerEntry {

    public enum Role { FROM, TO, FEE, FEE_REVENUE, CASH_IN, CASH_OUT }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "transfer_id", nullable = false)
    private Long transferId;

    @Column(name = "account_id", nullable = false)
    private Long accountId;

    /** Signed delta. Negative means money left this account. */
    @Column(name = "amount_cents", nullable = false)
    private long amountCents;

    @Enumerated(EnumType.STRING)
    @Column(name = "entry_role", nullable = false, length = 16)
    private Role role;

    @Column(name = "currency", nullable = false, length = 3)
    private String currency;

    /** Balance of the account immediately after this entry, for statement reads. */
    @Column(name = "balance_after_cents", nullable = false)
    private long balanceAfterCents;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
    }

    public Long getId() { return id; }
    public Long getTransferId() { return transferId; }
    public void setTransferId(Long transferId) { this.transferId = transferId; }
    public Long getAccountId() { return accountId; }
    public void setAccountId(Long accountId) { this.accountId = accountId; }
    public long getAmountCents() { return amountCents; }
    public void setAmountCents(long amountCents) { this.amountCents = amountCents; }
    public Role getRole() { return role; }
    public void setRole(Role role) { this.role = role; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public long getBalanceAfterCents() { return balanceAfterCents; }
    public void setBalanceAfterCents(long balanceAfterCents) { this.balanceAfterCents = balanceAfterCents; }
    public Instant getCreatedAt() { return createdAt; }
}
