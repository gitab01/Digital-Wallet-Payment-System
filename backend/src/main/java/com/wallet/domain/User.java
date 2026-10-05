package com.wallet.domain;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * Identity and credentials. There is no balance here and none on this row: money
 * lives only in ledger entries against accounts.
 */
@Entity
@Table(name = "users")
public class User {

    public enum Status { PENDING_KYC, ACTIVE, SUSPENDED, CLOSED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "email", nullable = false, length = 254, unique = true)
    private String email;

    @Column(name = "full_name", nullable = false, length = 120)
    private String fullName;

    @Column(name = "password_hash", nullable = false, length = 100)
    private String passwordHash;

    /** Separate from the password: a valid session is not permission to move money. */
    @Column(name = "pin_hash", nullable = false, length = 100)
    private String pinHash;

    @Column(name = "kyc_tier", nullable = false)
    private int kycTier;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private Status status = Status.PENDING_KYC;

    /** Set by reconciliation when the projection cannot be proved against the ledger. */
    @Column(name = "withdrawals_frozen", nullable = false)
    private boolean withdrawalsFrozen;

    @Column(name = "failed_pin_attempts", nullable = false)
    private int failedPinAttempts;

    @Column(name = "pin_locked_until")
    private Instant pinLockedUntil;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public Long getId() { return id; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
    public String getPinHash() { return pinHash; }
    public void setPinHash(String pinHash) { this.pinHash = pinHash; }
    public int getKycTier() { return kycTier; }
    public void setKycTier(int kycTier) { this.kycTier = kycTier; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public boolean isWithdrawalsFrozen() { return withdrawalsFrozen; }
    public void setWithdrawalsFrozen(boolean withdrawalsFrozen) { this.withdrawalsFrozen = withdrawalsFrozen; }
    public int getFailedPinAttempts() { return failedPinAttempts; }
    public void setFailedPinAttempts(int failedPinAttempts) { this.failedPinAttempts = failedPinAttempts; }
    public Instant getPinLockedUntil() { return pinLockedUntil; }
    public void setPinLockedUntil(Instant pinLockedUntil) { this.pinLockedUntil = pinLockedUntil; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
