package com.wallet.domain;

import jakarta.persistence.*;

import java.time.Instant;

/**
 * One side of one identity document, as stored bytes.
 *
 * There is deliberately no original filename here. A upload's filename is attacker
 * chosen text, it has no bearing on whether the image is genuine, and keeping it would
 * mean copying that text into a path or into a reviewer's screen.
 */
@Entity
@Table(name = "kyc_documents")
public class KycDocument {

    public enum Side { FRONT, BACK }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "kyc_record_id", nullable = false)
    private Long recordId;

    @Enumerated(EnumType.STRING)
    @Column(name = "side", nullable = false, length = 8)
    private Side side;

    /** Relative to the configured storage root; never an absolute path. */
    @Column(name = "storage_key", nullable = false, length = 120)
    private String storageKey;

    @Column(name = "byte_length", nullable = false)
    private int byteLength;

    @Column(name = "pixel_hash", nullable = false, length = 64)
    private String pixelHash;

    @Column(name = "uploaded_at", nullable = false)
    private Instant uploadedAt;

    @PrePersist
    @PreUpdate
    void onTouch() {
        uploadedAt = Instant.now();
    }

    public Long getId() { return id; }
    public Long getRecordId() { return recordId; }
    public void setRecordId(Long recordId) { this.recordId = recordId; }
    public Side getSide() { return side; }
    public void setSide(Side side) { this.side = side; }
    public String getStorageKey() { return storageKey; }
    public void setStorageKey(String storageKey) { this.storageKey = storageKey; }
    public int getByteLength() { return byteLength; }
    public void setByteLength(int byteLength) { this.byteLength = byteLength; }
    public String getPixelHash() { return pixelHash; }
    public void setPixelHash(String pixelHash) { this.pixelHash = pixelHash; }
    public Instant getUploadedAt() { return uploadedAt; }
    public void setUploadedAt(Instant uploadedAt) { this.uploadedAt = uploadedAt; }
}
