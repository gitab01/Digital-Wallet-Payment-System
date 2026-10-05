package com.wallet.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;

/**
 * A KYC submission. The document number is never stored in plaintext: a SHA-256
 * hash detects reuse across identities, and the last four characters are enough
 * to show a human which document a record refers to.
 */
@Entity
@Table(name = "kyc_records")
public class KycRecord {

    public enum Status { SUBMITTED, APPROVED, REJECTED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "tier", nullable = false)
    private int tier;

    @Column(name = "document_type", nullable = false, length = 24)
    private String documentType;

    @Column(name = "document_hash", nullable = false, length = 64)
    private String documentHash;

    @Column(name = "document_last4", nullable = false, length = 4)
    private String documentLast4;

    @Column(name = "phone", nullable = false, length = 24)
    private String phone;

    @Column(name = "date_of_birth", nullable = false)
    private LocalDate dateOfBirth;

    @Column(name = "country", nullable = false, length = 2)
    private String country;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private Status status = Status.SUBMITTED;

    @Column(name = "submitted_at", nullable = false)
    private Instant submittedAt;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @PrePersist
    void onCreate() {
        submittedAt = Instant.now();
    }

    public Long getId() { return id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public int getTier() { return tier; }
    public void setTier(int tier) { this.tier = tier; }
    public String getDocumentType() { return documentType; }
    public void setDocumentType(String documentType) { this.documentType = documentType; }
    public String getDocumentHash() { return documentHash; }
    public void setDocumentHash(String documentHash) { this.documentHash = documentHash; }
    public String getDocumentLast4() { return documentLast4; }
    public void setDocumentLast4(String documentLast4) { this.documentLast4 = documentLast4; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public LocalDate getDateOfBirth() { return dateOfBirth; }
    public void setDateOfBirth(LocalDate dateOfBirth) { this.dateOfBirth = dateOfBirth; }
    public String getCountry() { return country; }
    public void setCountry(String country) { this.country = country; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public Instant getSubmittedAt() { return submittedAt; }
    public Instant getReviewedAt() { return reviewedAt; }
    public void setReviewedAt(Instant reviewedAt) { this.reviewedAt = reviewedAt; }
}
