package com.wallet.service;

import com.wallet.domain.AuditLog.Outcome;
import com.wallet.domain.KycRecord;
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
import java.util.Map;
import java.util.Set;

/**
 * Identity verification records.
 *
 * The document number is stored only as a digest plus its last four characters. That
 * is enough to prove two submissions are not the same identity document, which is
 * what matters for the duplicate check, without turning this database into a file of
 * scanned IDs.
 *
 * The images that show the number belongs to a real person are a separate concern in
 * a separate service, and approval is the place where the two meet: a submission
 * cannot be approved while a side its document type requires is missing.
 */
@Service
public class KycService {

    /** The only document types this product accepts, and the only ones on the signup form. */
    public static final Set<String> ALLOWED_DOCUMENT_TYPES =
            Set.of("NATIONAL_ID", "PASSPORT", "DRIVING_LICENSE");

    public record Submission(Long recordId, int tier, String documentType, String last4,
                             KycRecord.Status status, Instant submittedAt, Instant reviewedAt,
                             Map<String, Long> sides, List<String> missing) {}

    private final KycRecordRepository records;
    private final UserRepository users;
    private final KycDocumentService documents;
    private final AuditService audit;

    public KycService(KycRecordRepository records, UserRepository users, KycDocumentService documents,
                      AuditService audit) {
        this.records = records;
        this.users = users;
        this.documents = documents;
        this.audit = audit;
    }

    @Transactional
    public void submitOnboarding(User user, String documentType, String documentNumber, String phone,
                                 LocalDate dateOfBirth, String country) {
        KycRecord record = newSubmission(user, 1, documentType, documentNumber, phone, dateOfBirth, country);
        records.save(record);
        audit.record(AuditService.Action.KYC_SUBMITTED, Outcome.SUCCESS, user.getId(),
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
        records.saveAndFlush(record);
        audit.record(AuditService.Action.KYC_SUBMITTED, Outcome.SUCCESS, userId,
                "tier " + nextTier + " " + documentType);
        return view(record);
    }

    /**
     * Operations decision. Approving moves the customer to the tier the record was
     * raised for, so the ceilings change with the decision rather than with a manual
     * edit of a user row.
     *
     * Two things have to be true before that can happen. The reviewer must not be the
     * subject — a reviewer who can approve themselves can raise their own ceilings —
     * and every side the document type requires must have been filed, which is what
     * stops a number being traded for a tier.
     */
    @Transactional
    public Submission decide(Long recordId, boolean approve, Long reviewerId, String reviewerEmail) {
        KycRecord record = records.findById(recordId)
                .orElseThrow(() -> ApiException.notFound("KYC_NOT_FOUND", "No such verification record."));
        if (record.getStatus() != KycRecord.Status.SUBMITTED) {
            throw ApiException.conflict("ALREADY_DECIDED", "That submission has already been reviewed.");
        }
        if (reviewerId != null && reviewerId.equals(record.getUserId())) {
            throw ApiException.of(HttpStatus.FORBIDDEN, "SELF_REVIEW",
                    "A reviewer cannot decide their own verification.");
        }
        if (approve) {
            List<String> missing = documents.missingSides(record);
            if (!missing.isEmpty()) {
                throw ApiException.of(HttpStatus.CONFLICT, "DOCUMENTS_INCOMPLETE",
                        "Approval needs " + String.join(" and ", missing) + " of the document.",
                        Map.of("missing", missing));
            }
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

        audit.record(AuditService.Action.KYC_DECIDED, Outcome.SUCCESS, record.getUserId(),
                "record " + recordId + " tier " + record.getTier() + " " + record.getStatus()
                        + " by " + reviewerEmail);
        return view(record);
    }

    public List<Submission> history(Long userId) {
        List<KycRecord> rows = records.findByUserIdOrderByIdDesc(userId);
        Map<Long, Map<String, Long>> sides = documents.sidesFor(rows.stream().map(KycRecord::getId).toList());
        return rows.stream().map(r -> view(r, sides.getOrDefault(r.getId(), Map.of()))).toList();
    }

    public Submission view(KycRecord record) {
        return view(record, documents.sidesFor(List.of(record.getId())).getOrDefault(record.getId(), Map.of()));
    }

    private Submission view(KycRecord r, Map<String, Long> sides) {
        Map<String, Long> complete = new java.util.LinkedHashMap<>();
        complete.put("FRONT", sides.get("FRONT"));
        complete.put("BACK", sides.get("BACK"));
        List<String> missing = KycDocumentService.requiredSides(r.getDocumentType()).stream()
                .filter(side -> sides.get(side) == null)
                .toList();
        return new Submission(r.getId(), r.getTier(), r.getDocumentType(), r.getDocumentLast4(),
                r.getStatus(), r.getSubmittedAt(), r.getReviewedAt(), complete, missing);
    }

    private KycRecord newSubmission(User user, int tier, String documentType, String documentNumber,
                                    String phone, LocalDate dateOfBirth, String country) {
        if (documentNumber == null || documentNumber.isBlank()
                || documentType == null || documentType.isBlank()) {
            throw ApiException.of(HttpStatus.BAD_REQUEST, "DOCUMENT_REQUIRED",
                    "An identity document type and number are required.");
        }
        String normalisedType = documentType.trim().toUpperCase();
        if (!ALLOWED_DOCUMENT_TYPES.contains(normalisedType)) {
            throw ApiException.validation("documentType must be one of "
                    + String.join(", ", ALLOWED_DOCUMENT_TYPES.stream().sorted().toList()) + ".",
                    Map.of("documentType", documentType));
        }
        String hash = sha256(normalisedType + ":" + documentNumber.trim().toUpperCase());
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
        record.setDocumentType(normalisedType);
        record.setDocumentHash(hash);
        record.setDocumentLast4(last4(documentNumber));
        record.setPhone(phone);
        record.setDateOfBirth(dateOfBirth);
        record.setCountry(country);
        record.setStatus(KycRecord.Status.SUBMITTED);
        return record;
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
