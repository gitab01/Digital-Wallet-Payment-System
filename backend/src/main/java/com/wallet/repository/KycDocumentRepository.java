package com.wallet.repository;

import com.wallet.domain.KycDocument;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface KycDocumentRepository extends JpaRepository<KycDocument, Long> {

    Optional<KycDocument> findByRecordIdAndSide(Long recordId, KycDocument.Side side);

    List<KycDocument> findByRecordIdOrderBySideAsc(Long recordId);

    List<KycDocument> findByRecordIdIn(List<Long> recordIds);

    /**
     * Which other customers have filed an identical image.
     *
     * Matching on content rather than on the document number is the point: two
     * submissions with different numbers and the same photograph are one person's ID
     * card reused across wallets, and the numbers alone never show it.
     */
    @Query("""
            SELECT DISTINCT r.userId
              FROM KycDocument d, KycRecord r
             WHERE d.recordId = r.id
               AND d.pixelHash = :hash
               AND r.userId <> :userId
            """)
    List<Long> otherUsersWithSameImage(@Param("hash") String hash, @Param("userId") Long userId);
}
