package com.wallet.domain;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * A wallet, or one of the two system counterparties every double entry needs.
 *
 * balanceCents is a projection, not the truth. It is maintained in the same
 * transaction that writes the entries so a reader never sees a half-applied
 * movement, and reconciliation can always recompute it from the ledger.
 */
@Entity
@Table(name = "accounts")
public class Account {

    public enum Kind { CUSTOMER_WALLET, CASH_IN_PROVIDER, FEE_REVENUE }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Null only for system accounts, which belong to the platform rather than a person. */
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "currency", nullable = false, length = 3)
    private String currency;

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false, length = 24)
    private Kind kind;

    @Column(name = "label", nullable = false, length = 60)
    private String label;

    @Column(name = "balance_cents", nullable = false)
    private long balanceCents;

    /** Read as part of the pessimistic lock chain; also useful for drift forensics. */
    @Version
    @Column(name = "version", nullable = false)
    private int version;

    /** When this projection was last proved against the ledger: the "verified" flag. */
    @Column(name = "projection_at")
    private Instant projectionAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
    }

    public Long getId() { return id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public Kind getKind() { return kind; }
    public void setKind(Kind kind) { this.kind = kind; }
    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }
    public long getBalanceCents() { return balanceCents; }
    public void setBalanceCents(long balanceCents) { this.balanceCents = balanceCents; }
    public int getVersion() { return version; }
    public Instant getProjectionAt() { return projectionAt; }
    public void setProjectionAt(Instant projectionAt) { this.projectionAt = projectionAt; }
    public Instant getCreatedAt() { return createdAt; }
    public boolean isCustomerWallet() { return kind == Kind.CUSTOMER_WALLET; }
}
