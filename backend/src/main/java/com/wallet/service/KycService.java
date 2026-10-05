package com.wallet.service;

import com.wallet.domain.KycRecord;
import com.wallet.domain.AuditLog;
import com.wallet.domain.User;
import com.wallet.error.ApiException;
import com.wallet.repository.KycRecordRepository;
import com.wallet.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * Identity verification records.
 *
 * The document number is stored only as a digest plus its last four characters. That
 * is enough to prove two submissions are not the same identity document, which is
 * what matters for the duplicate check, without turning this database into a file of
 * scanned IDs.
 */
@Service
public class KycService {

    public record Submission(int tier, String documentType, String last4, KycRecord.Status status,
                             Instant submittedAt, Instant reviewedAt) {}

    private final KycRecordRepository records;
    private final UserRepository users;
    private final AuditService audit;

    public KycService(KycRecordRepository records, UserRepository users, AuditService audit) {
        this.records = records;
        this.users = users;
        this.audit = audit;
    }

    @Transactional
    public void submitOnboarding(User user, String documentType, String documentNumber, String phone,
                                 LocalDate dateOfBirth, String country) {
        KycRecord record = newSubmission(user, 1, documentType, documentNumber, phone, dateOfBirth, country);
        records.save(record);
        audit.record(AuditService.Action.KYC_SUBMITTED, AuditLog.Outcome.SUCCESS, user.getId(),
                "tier 1 " + documentType);
    }

    @Transactional
    public Submission submitUpgrade(Long userId, String documentType, String documentNumber, String phone,
                                    LocalDate dateOfBirth, String country) {
        User user = users.findById(userId)
                .orElseThrow(() -> ApiException.notFound("USER_NOT_FOUND", "No customer for this session."));

        int nextTier = user.getKycTier() + 1;
        if (nextTier > 3) {
            throw ApiException.conflict("TOP_TIER", "This account is already at the highest tier.");
        }
        if (records.findByUserIdOrderByIdDesc(userId).stream()
                .anyMatch(r -> r.getTier() == nextTier && r.getStatus() == KycRecord.Status.SUBMITTED)) {
            throw ApiException.conflict("ALREADY_SUBMITTED", "That tier already has a review in progress.");
        }

        KycRecord record = newSubmission(user, nextTier, documentType, documentNumber, phone, dateOfBirth, country);
        records.save(record);
        audit.record(AuditService.Action.KYC_SUBMITTED, AuditLog.Outcome.SUCCESS, userId,
                "tier " + nextTier + " " + documentType);
        return view(record);
    }

    /**
     * Operations decision. Approving moves the customer to the tier the record was
     * raised for, so the ceilings change with the decision rather than with a manual
     * edit of a user row.
     */
    @Transactional
    public Submission decide(Long recordId, boolean approve, String reviewerEmail) {
        KycRecord record = records.findById(recordId)
                .orElseThrow(() -> ApiException.notFound("KYC_NOT_FOUND", "No such verification record."));
        if (record.getStatus() != KycRecord.Status.SUBMITTED) {
            throw ApiException.conflict("ALREADY_DECIDED", "That submission has already been reviewed.");
        }

        record.setStatus(approve ? KycRecord.Status.APPROVED : KycRecord.Status.REJECTED);
        record.setReviewedAt(Instant.now());
        records.save(record);

        User user = users.findById(record.getUserId()).orElseThrow();
        if (approve) {
            user.setKycTier(record.getTier());
            user.setStatus(User.Status.ACTIVE);
            users.save(user);
        }

        audit.record(AuditService.Action.KYC_DECIDED, AuditLog.Outcome.SUCCESS, record.getUserId(),
                "record " + recordId + " tier " + record.getTier() + " " + record.getStatus()
                        + " by " + reviewerEmail);
        return view(record);
    }

    public List<Submission> history(Long userId) {
        return records.findByUserIdOrderByIdDesc(userId).stream().map(KycService::view).toList();
    }

    public KycRecord.Status currentStatus(Long userId) {
        return records.findFirstByUserIdAndStatusOrderByIdDesc(userId, KycRecord.Status.APPROVED)
                .map(KycRecord::getStatus)
                .orElseGet(() -> records.findByUserIdOrderByIdDesc(userId).stream()
                        .findFirst()
                        .map(KycRecord::getStatus)
                        .orElse(KycRecord.Status.SUBMITTED));
    }

    private KycRecord newSubmission(User user, int tier, String documentType, String documentNumber,
                                    String phone, LocalDate dateOfBirth, String country) {
        if (documentNumber == null || documentNumber.isBlank()
                || documentType == null || documentType.isBlank()) {
            throw ApiException.of(HttpStatus.BAD_REQUEST, "DOCUMENT_REQUIRED",
                    "An identity document type and number are required.");
        }
        String hash = sha256(documentType + ":" + documentNumber.trim().toUpperCase());
        if (records.findByDocumentHashAndTier(hash, tier).isPresent()) {
            // The same document cannot verify two accounts: that is the shape of an
            // identity-farm signup, and the unique index makes it a hard no.
            throw ApiException.conflict("DOCUMENT_IN_USE", "That document is already on file.");
        }
        if (dateOfBirth.isAfter(LocalDate.now().minusYears(18))) {
            throw ApiException.of(HttpStatus.FORBIDDEN, "TOO_YOUNG", "Account holders must be 18 or older.");
        }

        KycRecord record = new KycRecord();
        record.setUserId(user.getId());
        record.setTier(tier);
        record.setDocumentType(documentType.trim());
        record.setDocumentHash(hash);
        record.setDocumentLast4(last4(documentNumber));
        record.setPhone(phone);
        record.setDateOfBirth(dateOfBirth);
        record.setCountry(country);
        record.setStatus(KycRecord.Status.SUBMITTED);
        return record;
    }

    private static Submission view(KycRecord r) {
        return new Submission(r.getTier(), r.getDocumentType(), r.getDocumentLast4(), r.getStatus(),
                r.getSubmittedAt(), r.getReviewedAt());
    }

    private static String last4(String documentNumber) {
        String trimmed = documentNumber.trim();
        return trimmed.length() <= 4 ? trimmed : trimmed.substring(trimmed.length() - 4);
    }

    private static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) hex.append(String.format("%02x", b));
            return hex.toString();
        } catch (Exception ex) {
            throw new IllegalStateException("SHA-256 unavailable", ex);
        }
    }
}
