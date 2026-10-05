package com.wallet.repository;

import com.wallet.domain.Transfer;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;

public interface TransferRepository extends JpaRepository<Transfer, Long> {

    Optional<Transfer> findByOwnerUserIdAndIdempotencyKey(Long ownerUserId, String idempotencyKey);

    Optional<Transfer> findByReference(String reference);

    /**
     * Daily and monthly ceiling arithmetic, per currency.
     *
     * Outflow is principal plus fee: a limit that ignored fees would let a user
     * spend more than the tier actually permits. Only COMPLETED movements count,
     * because a rolled-back transfer never touched money.
     */
    @Query("""
            SELECT COALESCE(SUM(t.amountCents + t.feeCents), 0) FROM Transfer t
            WHERE t.ownerUserId = :userId
              AND t.currency = :currency
              AND t.status = com.wallet.domain.Transfer.Status.COMPLETED
              AND t.fromAccountId IS NOT NULL
              AND t.initiatedAt >= :since
            """)
    long sumOutflowSince(@Param("userId") Long userId,
                         @Param("currency") String currency,
                         @Param("since") Instant since);

    @Query("""
            SELECT t FROM Transfer t
            WHERE t.ownerUserId = :userId
              AND (:accountId IS NULL
                   OR t.fromAccountId = :accountId
                   OR t.toAccountId = :accountId)
              AND t.initiatedAt BETWEEN :from AND :to
            """)
    Page<Transfer> search(@Param("userId") Long userId,
                          @Param("accountId") Long accountId,
                          @Param("from") Instant from,
                          @Param("to") Instant to,
                          Pageable pageable);

    /** Behavioural baseline for anomaly scoring: the user's own completed outflow. */
    @Query("""
            SELECT t FROM Transfer t
            WHERE t.ownerUserId = :userId
              AND t.status = com.wallet.domain.Transfer.Status.COMPLETED
              AND t.fromAccountId IS NOT NULL
            ORDER BY t.initiatedAt DESC
            """)
    java.util.List<Transfer> recentOutflow(@Param("userId") Long userId, Pageable pageable);
}
