package com.wallet.service;

import com.wallet.domain.AuditLog.Outcome;
import com.wallet.domain.KycDocument;
import com.wallet.domain.KycRecord;
import com.wallet.error.ApiException;
import com.wallet.repository.KycDocumentRepository;
import com.wallet.repository.KycRecordRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * The images that prove a document number belongs to a real person.
 *
 * A submission is not reviewable on its number alone, so this service also owns the
 * rule about which sides a document type must have been filed with: a national ID and
 * a licence are read on both sides, a passport has one information page. An unknown
 * type requires both, because guessing that a type nobody documented is the lenient
 * kind is how a verification rule quietly stops existing.
 */
@Service
public class KycDocumentService {

    public record View(Long id, Long recordId, String side, int byteLength, Instant uploadedAt) {}

    private static final Set<String> PASSPORT_STYLE = Set.of("PASSPORT");

    private final KycDocumentRepository docs;
    private final KycRecordRepository records;
    private final DocumentStore store;
    private final AuditService audit;

    public KycDocumentService(KycDocumentRepository docs, KycRecordRepository records,
                              DocumentStore store, AuditService audit) {
        this.docs = docs;
        this.records = records;
        this.store = store;
        this.audit = audit;
    }

    public static List<String> requiredSides(String documentType) {
        boolean singlePage = documentType != null && PASSPORT_STYLE.contains(documentType.trim().toUpperCase());
        return singlePage ? List.of(KycDocument.Side.FRONT.name())
                : List.of(KycDocument.Side.FRONT.name(), KycDocument.Side.BACK.name());
    }

    /** The sides this submission still has to be given before it can be approved. */
    public List<String> missingSides(KycRecord record) {
        return missingSides(record, docs.findByRecordIdOrderBySideAsc(record.getId()));
    }

    private static List<String> missingSides(KycRecord record, List<KycDocument> filed) {
        Set<String> present = filed.stream().map(d -> d.getSide().name()).collect(Collectors.toSet());
        return requiredSides(record.getDocumentType()).stream()
                .filter(side -> !present.contains(side))
                .toList();
    }

    @Transactional
    public View upload(Long userId, String sideRaw, MultipartFile file) {
        KycDocument.Side side = parseSide(sideRaw);
        KycRecord record = records.findByUserIdOrderByIdDesc(userId).stream()
                .filter(r -> r.getStatus() == KycRecord.Status.SUBMITTED)
                .findFirst()
                .orElseThrow(() -> ApiException.conflict("NO_OPEN_SUBMISSION",
                        "There is no verification in progress to attach a document to."));

        DocumentStore.Stored stored = store.store(file);

        // Replacing a side updates its row instead of deleting and re-inserting it, so
        // a reviewer already looking at document 12 is not silently shown a different
        // photograph, and the unique (record, side) index never sees a gap.
        KycDocument doc = docs.findByRecordIdAndSide(record.getId(), side).orElseGet(KycDocument::new);
        String supersededKey = doc.getStorageKey();
        doc.setRecordId(record.getId());
        doc.setSide(side);
        doc.setStorageKey(stored.key());
        doc.setByteLength(stored.byteLength());
        doc.setPixelHash(stored.sha256());
        docs.saveAndFlush(doc);

        // The old bytes are only released once the new row exists; until this line the
        // database still describes a file that is on disk.
        if (supersededKey != null) store.delete(supersededKey);

        audit.record(AuditService.Action.KYC_DOCUMENT_UPLOADED, Outcome.SUCCESS,
                userId, "record " + record.getId() + " " + side + " " + stored.sha256().substring(0, 12));
        return view(doc);
    }

    /**
     * Bytes for one image, with the access decision made here rather than in a
     * controller annotation: the rule depends on the row being read, because the
     * owner of a document is found through its submission, not through the document.
     */
    @Transactional
    public byte[] readForViewer(Long documentId, Long viewerId, boolean reviewer) {
        KycDocument doc = docs.findById(documentId)
                .orElseThrow(() -> ApiException.notFound("DOCUMENT_NOT_FOUND", "No such document image."));
        KycRecord record = records.findById(doc.getRecordId())
                .orElseThrow(() -> ApiException.notFound("DOCUMENT_NOT_FOUND", "No such document image."));

        if (!reviewer && !record.getUserId().equals(viewerId)) {
            throw ApiException.of(HttpStatus.FORBIDDEN, "FORBIDDEN", "That document is not yours.");
        }

        byte[] bytes = store.read(doc.getStorageKey());
        audit.record(AuditService.Action.KYC_DOCUMENT_VIEWED, Outcome.SUCCESS,
                viewerId, "document " + documentId + " of user " + record.getUserId()
                        + (reviewer ? " by review desk" : " by owner"));
        return bytes;
    }

    public List<View> forRecord(Long recordId) {
        return docs.findByRecordIdOrderBySideAsc(recordId).stream().map(KycDocumentService::view).toList();
    }

    /** Document ids by record and side, for the shapes that a review desk reads in bulk. */
    public Map<Long, Map<String, Long>> sidesFor(Collection<Long> recordIds) {
        Map<Long, Map<String, Long>> byRecord = new HashMap<>();
        if (recordIds.isEmpty()) return byRecord;
        for (KycDocument doc : docs.findByRecordIdIn(List.copyOf(recordIds))) {
            byRecord.computeIfAbsent(doc.getRecordId(), k -> new LinkedHashMap<>())
                    .put(doc.getSide().name(), doc.getId());
        }
        return byRecord;
    }

    /** What the review queue shows per submission: the sides still owed, and a reused image. */
    public record QueueFacts(List<String> missingSides, Long duplicateOfUserId) {
        static final QueueFacts COMPLETE = new QueueFacts(List.of(), null);
    }

    /**
     * Both queue facts for a page of submissions, in two queries rather than four apiece.
     *
     * Another customer's submission carrying an identical image is reported, never
     * blocked: the honest reading is "look closely at this one", and a legitimate
     * re-filing of the same physical document by the same person is not a fraud. The
     * owner named is the lowest user id among them, because the desk re-reads the same
     * queue and a figure that moves between two looks is a figure nobody trusts.
     */
    public Map<Long, QueueFacts> factsFor(Collection<KycRecord> open) {
        if (open.isEmpty()) return Map.of();

        Map<Long, List<KycDocument>> filedBy = new HashMap<>();
        for (KycDocument doc : docs.findByRecordIdIn(open.stream().map(KycRecord::getId).toList())) {
            filedBy.computeIfAbsent(doc.getRecordId(), k -> new ArrayList<>()).add(doc);
        }

        Set<String> hashes = filedBy.values().stream().flatMap(List::stream)
                .map(KycDocument::getPixelHash).filter(Objects::nonNull).collect(Collectors.toSet());
        Map<String, Set<Long>> ownersOf = new HashMap<>();
        if (!hashes.isEmpty()) {
            for (KycDocumentRepository.ImageOwner owner : docs.usersByImageHash(hashes)) {
                ownersOf.computeIfAbsent(owner.getPixelHash(), k -> new HashSet<>()).add(owner.getUserId());
            }
        }

        Map<Long, QueueFacts> facts = new HashMap<>();
        for (KycRecord record : open) {
            List<KycDocument> images = filedBy.getOrDefault(record.getId(), List.of());
            Long duplicate = images.stream()
                    .map(image -> firstOwnerExcept(ownersOf.get(image.getPixelHash()), record.getUserId()))
                    .filter(Objects::nonNull)
                    .min(Long::compare)
                    .orElse(null);
            facts.put(record.getId(), new QueueFacts(missingSides(record, images), duplicate));
        }
        return facts;
    }

    private static Long firstOwnerExcept(Set<Long> owners, Long exceptUserId) {
        if (owners == null) return null;
        return owners.stream().filter(id -> !id.equals(exceptUserId)).min(Long::compare).orElse(null);
    }

    private static KycDocument.Side parseSide(String raw) {
        if (raw == null || raw.isBlank()) {
            throw ApiException.validation("Choose FRONT or BACK for the document image.",
                    Map.of("side", "required"));
        }
        return Arrays.stream(KycDocument.Side.values())
                .filter(s -> s.name().equalsIgnoreCase(raw.trim()))
                .findFirst()
                .orElseThrow(() -> ApiException.validation("side must be FRONT or BACK.",
                        Map.of("side", raw)));
    }

    private static View view(KycDocument doc) {
        return new View(doc.getId(), doc.getRecordId(), doc.getSide().name(), doc.getByteLength(),
                doc.getUploadedAt());
    }
}
