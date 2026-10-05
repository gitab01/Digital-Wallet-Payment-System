package com.wallet.repository;

import com.wallet.domain.LedgerEntry;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

/**
 * Reads only. There is no save path here on purpose: entries are written by
 * LedgerService as one multi-row statement, which is what lets the database's
 * statement-level posting guard see every leg at once.
 */
public interface LedgerEntryRepository extends JpaRepository<LedgerEntry, Long> {

    List<LedgerEntry> findByTransferIdOrderByIdAsc(Long transferId);

    /** History pages are annotated with their entry ids in one read, not one per row. */
    List<LedgerEntry> findByTransferIdInOrderByIdAsc(Collection<Long> transferIds);

    List<LedgerEntry> findByAccountIdAndCreatedAtBetweenOrderByCreatedAtDesc(
            Long accountId, Instant from, Instant to, Pageable pageable);

    List<LedgerEntry> findByAccountIdOrderByCreatedAtDesc(Long accountId, Pageable pageable);
}
