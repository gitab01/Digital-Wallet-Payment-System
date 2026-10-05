package com.wallet.repository;

import com.wallet.domain.RefreshToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {

    Optional<RefreshToken> findByTokenHash(String tokenHash);

    Optional<RefreshToken> findByIdAndUserId(Long id, Long userId);

    /**
     * Reuse of a rotated token means the family leaked, so the whole lineage is
     * revoked in one statement rather than leaving later tokens live.
     */
    @Modifying
    @Query("""
            UPDATE RefreshToken t SET t.revokedAt = CURRENT_TIMESTAMP
            WHERE t.familyId = :familyId AND t.revokedAt IS NULL
            """)
    int revokeFamily(@Param("familyId") UUID familyId);

    @Modifying
    @Query("DELETE FROM RefreshToken t WHERE t.expiresAt < :cutoff")
    int deleteExpired(@Param("cutoff") Instant cutoff);
}
