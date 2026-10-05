package com.wallet.service;

import com.wallet.config.WalletProperties;
import com.wallet.domain.AuditLog;
import com.wallet.domain.User;
import com.wallet.error.ApiException;
import com.wallet.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.Instant;

/**
 * PIN step-up. A valid session proves who you are; it does not prove that you meant
 * to move money, so every outflow asks for a second, separately stored credential.
 *
 * Failures are counted and locked: five wrong PINs freeze PIN use for a window,
 * which makes credential guessing a losing proposition.
 */
@Service
public class PinService {

    private final PasswordEncoder encoder;
    private final UserRepository users;
    private final PinAttemptStore attempts;
    private final WalletProperties props;
    private final AuditService audit;

    public PinService(PasswordEncoder encoder, UserRepository users, PinAttemptStore attempts,
                      WalletProperties props, AuditService audit) {
        this.encoder = encoder;
        this.users = users;
        this.attempts = attempts;
        this.props = props;
        this.audit = audit;
    }

    /**
     * @param pin plaintext PIN: never logged, never returned, never stored.
     * @throws ApiException PIN_LOCKED while the lockout window is open, PIN_INVALID
     *         otherwise with the attempts left, so the UI can warn before a lockout.
     */
    public void verifyOrThrow(User user, String pin) {
        Instant now = Instant.now();

        if (user.getPinLockedUntil() != null && user.getPinLockedUntil().isAfter(now)) {
            audit.recordDetached(AuditService.Action.PIN_FAILURE, AuditLog.Outcome.DENIED, user.getId(),
                    "attempt while locked out");
            throw ApiException.pinLocked(user.getPinLockedUntil().toString());
        }

        if (pin == null || !pin.matches("\\d{4}")) {
            throw ApiException.of(HttpStatus.BAD_REQUEST, "PIN_REQUIRED",
                    "A 4-digit PIN is required to move money.");
        }

        if (encoder.matches(pin, user.getPinHash())) {
            if (user.getFailedPinAttempts() != 0 || user.getPinLockedUntil() != null) {
                attempts.clear(user.getId());
                user.setFailedPinAttempts(0);
                user.setPinLockedUntil(null);
            }
            return;
        }

        int failed = user.getFailedPinAttempts() + 1;
        int max = props.getPin().getMaxFailedAttempts();
        boolean locking = failed >= max;
        Instant lockedUntil = locking ? now.plus(props.getPin().getLockout()) : null;

        // Written before the rejection is raised, in its own transaction, so the
        // counter survives the rollback of the money transaction that just failed.
        attempts.registerFailure(user.getId(), failed, lockedUntil);
        user.setFailedPinAttempts(failed);
        user.setPinLockedUntil(lockedUntil);

        if (locking) {
            audit.recordDetached(AuditService.Action.PIN_LOCKOUT, AuditLog.Outcome.DENIED, user.getId(),
                    max + " consecutive incorrect PINs");
            throw ApiException.pinLocked(lockedUntil.toString());
        }

        audit.recordDetached(AuditService.Action.PIN_FAILURE, AuditLog.Outcome.DENIED, user.getId(),
                "attempt " + failed + " of " + max);
        throw ApiException.pinInvalid(max - failed);
    }

    public void changePin(User user, String currentPin, String newPin) {
        verifyOrThrow(user, currentPin);

        if (newPin == null || !newPin.matches("\\d{4}")) {
            throw ApiException.of(HttpStatus.BAD_REQUEST, "PIN_REQUIRED", "A new PIN must be 4 digits.");
        }
        if (encoder.matches(newPin, user.getPinHash())) {
            throw ApiException.of(HttpStatus.BAD_REQUEST, "PIN_REUSED", "Choose a PIN you have not used before.");
        }

        user.setPinHash(encoder.encode(newPin));
        user.setFailedPinAttempts(0);
        user.setPinLockedUntil(null);
        users.save(user);
        audit.record(AuditService.Action.PIN_CHANGED, AuditLog.Outcome.SUCCESS, user.getId(), null);
    }
}
