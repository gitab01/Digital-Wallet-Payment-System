package com.digitalwallet.api.repository;

import com.digitalwallet.api.entity.Transaction;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Optional;

/**
 * Data access layer for {@link Transaction} entities.
 */
@Repository
public interface TransactionRepository extends JpaRepository<Transaction, Long> {

    Optional<Transaction> findByReferenceNumber(String referenceNumber);

    @Query("""
        SELECT t FROM Transaction t
        WHERE t.sourceWallet.id = :walletId
           OR t.destinationWallet.id = :walletId
        ORDER BY t.createdAt DESC
        """)
    Page<Transaction> findAllByWalletId(@Param("walletId") Long walletId, Pageable pageable);

    @Query("""
        SELECT t FROM Transaction t
        WHERE (t.sourceWallet.user.id = :userId OR t.destinationWallet.user.id = :userId)
          AND (:startDate IS NULL OR t.createdAt >= :startDate)
          AND (:endDate IS NULL OR t.createdAt <= :endDate)
          AND (:type IS NULL OR t.type = :type)
          AND (:status IS NULL OR t.status = :status)
        ORDER BY t.createdAt DESC
        """)
    Page<Transaction> findByUserIdWithFilters(
        @Param("userId") Long userId,
        @Param("startDate") LocalDateTime startDate,
        @Param("endDate") LocalDateTime endDate,
        @Param("type") Transaction.TransactionType type,
        @Param("status") Transaction.TransactionStatus status,
        Pageable pageable
    );
}
