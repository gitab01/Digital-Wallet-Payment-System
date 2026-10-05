package com.wallet.repository;

import com.wallet.domain.KycRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface KycRecordRepository extends JpaRepository<KycRecord, Long> {

    List<KycRecord> findByUserIdOrderByIdDesc(Long userId);

    Optional<KycRecord> findFirstByUserIdAndStatusOrderByIdDesc(Long userId, KycRecord.Status status);

    /** The review queue: submissions nobody has decided yet, oldest first. */
    List<KycRecord> findByStatusOrderByIdAsc(KycRecord.Status status);

    boolean existsByDocumentHash(String documentHash);

    Optional<KycRecord> findByDocumentHashAndTier(String documentHash, int tier);
}
