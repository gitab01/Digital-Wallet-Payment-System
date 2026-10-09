package com.wallet.repository;

import com.wallet.domain.KycDocument;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface KycDocumentRepository extends JpaRepository<KycDocument, Long> {

    Optional<KycDocument> findByRecordIdAndSide(Long recordId, KycDocument.Side side);

    List<KycDocument> findByRecordIdOrderBySideAsc(Long recordId);

    List<KycDocument> findByRecordIdIn(List<Long> recordIds);

    /**
     * Which customers have filed each of these images.
     *
     * Matching on content rather than on the document number is the point: two
     * submissions with different numbers and the same photograph are one person's ID
     * card reused across wallets, and the numbers alone never show it.
     *
     * A page of hashes rather than one, because the queue asks this for every open
     * submission: asking record by record cost 284 round trips before the desk drew.
     */
    @Query("""
           SELECT d.pixelHash AS pixelHash, r.userId AS userId
             FROM KycDocument d, KycRecord r
            WHERE d.recordId = r.id
              AND d.pixelHash IN :hashes
           """)
    List<ImageOwner> usersByImageHash(@Param("hashes") Collection<String> hashes);

    interface ImageOwner {
        String getPixelHash();

        Long getUserId();
    }
}
