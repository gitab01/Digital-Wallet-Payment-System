package com.wallet.service;

import com.wallet.repository.UserRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

/**
 * Persists the PIN lockout counter in a transaction of its own.
 *
 * This exists as a separate bean because Spring applies @Transactional through a
 * proxy: a REQUIRES_NEW method called from inside the same class would run in the
 * caller's transaction and be rolled back with it, which is the exact failure this
 * is here to prevent.
 */
@Component
public class PinAttemptStore {

    private final UserRepository users;

    public PinAttemptStore(UserRepository users) {
        this.users = users;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void registerFailure(long userId, int attempts, Instant lockedUntil) {
        users.recordPinAttempts(userId, attempts, lockedUntil);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void clear(long userId) {
        users.clearPinAttempts(userId);
    }
}
