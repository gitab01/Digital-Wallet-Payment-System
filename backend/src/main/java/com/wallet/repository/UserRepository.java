package com.wallet.repository;

import com.wallet.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long>, JpaSpecificationExecutor<User> {
    Optional<User> findByEmail(String email);
    boolean existsByEmail(String email);

    /**
     * The lockout counter is written outside the transaction it interrupted.
     *
     * Recording a failed PIN inside the money transaction would roll the counter back
     * along with the rejection, so an attacker could try unlimited PINs with each
     * attempt leaving no trace. The schema requires attempts to stay above zero while
     * a lock is open, which these statements respect.
     */
    @Modifying
    @Query("""
            UPDATE User u
               SET u.failedPinAttempts = :attempts,
                   u.pinLockedUntil = :lockedUntil
             WHERE u.id = :id
            """)
    int recordPinAttempts(@Param("id") Long id,
                          @Param("attempts") int attempts,
                          @Param("lockedUntil") Instant lockedUntil);

    @Modifying
    @Query("""
            UPDATE User u
               SET u.failedPinAttempts = 0, u.pinLockedUntil = NULL
             WHERE u.id = :id
            """)
    int clearPinAttempts(@Param("id") Long id);
}
