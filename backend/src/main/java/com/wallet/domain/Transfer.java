package com.wallet.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;

/**
 * The transfer aggregate: intent plus outcome. The money itself is in
 * {@link LedgerEntry}; a transfer without balanced entries cannot reach COMPLETED
 * because the database rejects it.
 */
@Entity
@Table(name = "transfers")
public class Transfer {

    public enum Type { TRANSFER, DEPOSIT, WITHDRAWAL }
    public enum Status { PENDING, COMPLETED, REVERSED, FAILED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** The id a customer quotes in a dispute, so it must be stable and printable. */
    @Column(name = "reference", nullable = false, length = 40, unique = true)
    private String reference;

    @Column(name = "owner_user_id", nullable = false)
    private Long ownerUserId;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 16)
    private Type type;

    /** Unique at the database level, so two racing retries collapse into one row. */
    @Column(name = "idempotency_key", nullable = false, length = 80)
    private String idempotencyKey;

    @Column(name = "from_account_id")
    private Long fromAccountId;

    @Column(name = "to_account_id")
    private Long toAccountId;

    @Column(name = "fee_account_id")
    private Long feeAccountId;

    @Column(name = "currency", nullable = false, length = 3)
    private String currency;

    @Column(name = "amount_cents", nullable = false)
    private long amountCents;

    @Column(name = "fee_cents", nullable = false)
    private long feeCents;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private Status status = Status.PENDING;

    @Column(name = "anomaly_score", precision = 7, scale = 4)
    private BigDecimal anomalyScore;

    /** Advisory signal from the anomaly model. Never blocks a transfer. */
    @Column(name = "review_flag", nullable = false)
    private boolean reviewFlag;

    @Column(name = "initiated_at", nullable = false)
    private Instant initiatedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @PrePersist
    void onCreate() {
        if (initiatedAt == null) initiatedAt = Instant.now();
    }

    public Long getId() { return id; }
    public String getReference() { return reference; }
    public void setReference(String reference) { this.reference = reference; }
    public Long getOwnerUserId() { return ownerUserId; }
    public void setOwnerUserId(Long ownerUserId) { this.ownerUserId = ownerUserId; }
    public Type getType() { return type; }
    public void setType(Type type) { this.type = type; }
    public String getIdempotencyKey() { return idempotencyKey; }
    public void setIdempotencyKey(String idempotencyKey) { this.idempotencyKey = idempotencyKey; }
    public Long getFromAccountId() { return fromAccountId; }
    public void setFromAccountId(Long fromAccountId) { this.fromAccountId = fromAccountId; }
    public Long getToAccountId() { return toAccountId; }
    public void setToAccountId(Long toAccountId) { this.toAccountId = toAccountId; }
    public Long getFeeAccountId() { return feeAccountId; }
    public void setFeeAccountId(Long feeAccountId) { this.feeAccountId = feeAccountId; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public long getAmountCents() { return amountCents; }
    public void setAmountCents(long amountCents) { this.amountCents = amountCents; }
    public long getFeeCents() { return feeCents; }
    public void setFeeCents(long feeCents) { this.feeCents = feeCents; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public BigDecimal getAnomalyScore() { return anomalyScore; }
    public void setAnomalyScore(BigDecimal anomalyScore) { this.anomalyScore = anomalyScore; }
    public boolean isReviewFlag() { return reviewFlag; }
    public void setReviewFlag(boolean reviewFlag) { this.reviewFlag = reviewFlag; }
    public Instant getInitiatedAt() { return initiatedAt; }
    public Instant getCompletedAt() { return completedAt; }
    public void setCompletedAt(Instant completedAt) { this.completedAt = completedAt; }
}
