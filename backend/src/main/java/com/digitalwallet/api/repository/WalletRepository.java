package com.digitalwallet.api.repository;

import com.digitalwallet.api.entity.Wallet;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;

/**
 * Data access layer for {@link Wallet} entities.
 */
@Repository
public interface WalletRepository extends JpaRepository<Wallet, Long> {

    List<Wallet> findByUserId(Long userId);

    Optional<Wallet> findByWalletNumber(String walletNumber);

    Optional<Wallet> findByUserIdAndCurrencyCode(Long userId, String currencyCode);

    Optional<Wallet> findByUserIdAndIsDefaultTrue(Long userId);

    boolean existsByWalletNumber(String walletNumber);

    /**
     * Pessimistic write lock for concurrent balance updates.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT w FROM Wallet w WHERE w.id = :id")
    Optional<Wallet> findByIdWithLock(Long id);
}
