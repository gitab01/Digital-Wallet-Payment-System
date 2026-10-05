package com.wallet.service;

import com.wallet.domain.RefreshToken;
import com.wallet.error.ApiException;
import com.wallet.repository.RefreshTokenRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;

/**
 * Refresh token rotation with reuse detection.
 *
 * Each refresh token is single-use: presenting it issues a replacement and marks the
 * original consumed. If a consumed token is presented again, the lineage it belongs
 * to is revoked wholesale, because the only ways that happens are a replay by
 * someone who copied the token, or a client bug that re-sent it — and the safe
 * response to either is to end the family and force a fresh sign-in.
 */
@Service
public class RefreshTokenService {

    private static final SecureRandom RANDOM = new SecureRandom();

    public record Issued(String token, RefreshToken row) {}

    private final RefreshTokenRepository store;

    public RefreshTokenService(RefreshTokenRepository store) {
        this.store = store;
    }

    @Transactional
    public Issued issue(long userId, UUID familyId) {
        String raw = randomToken();
        RefreshToken row = new RefreshToken();
        row.setUserId(userId);
        row.setTokenHash(sha256(raw));
        row.setFamilyId(familyId == null ? UUID.randomUUID() : familyId);
        row.setExpiresAt(Instant.now().plusSeconds(60 * 60 * 24 * 30));
        store.save(row);
        return new Issued(raw, row);
    }

    /**
     * @return the user id the presented token belongs to, after consuming it.
     */
    @Transactional
    public long consume(String rawToken, long ttlSecondsFallback) {
        Optional<RefreshToken> found = store.findByTokenHash(sha256(rawToken));
        if (found.isEmpty()) {
            throw unauthorized();
        }
        RefreshToken token = found.get();

        if (token.getRevokedAt() != null || token.getReplacedBy() != null) {
            // Reuse: kill every token descended from the same login.
            store.revokeFamily(token.getFamilyId());
            throw unauthorized();
        }
        if (token.getExpiresAt().isBefore(Instant.now())) {
            throw unauthorized();
        }
        return token.getUserId();
    }

    @Transactional
    public void markReplaced(RefreshToken original, RefreshToken replacement) {
        original.setReplacedBy(replacement.getId());
        original.setRevokedAt(Instant.now());
        store.save(original);
    }

    @Transactional
    public void revokeFamilyOf(String rawToken) {
        store.findByTokenHash(sha256(rawToken)).ifPresent(t -> store.revokeFamily(t.getFamilyId()));
    }

    public RefreshToken findRow(String rawToken) {
        return store.findByTokenHash(sha256(rawToken)).orElse(null);
    }

    private static ApiException unauthorized() {
        return ApiException.of(HttpStatus.UNAUTHORIZED, "TOKEN_EXPIRED",
                "This session has ended. Sign in again.");
    }

    private static String randomToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /** Only the digest is stored, so a database dump cannot be replayed as a session. */
    private static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) hex.append(String.format("%02x", b));
            return hex.toString();
        } catch (Exception ex) {
            throw new IllegalStateException("SHA-256 unavailable", ex);
        }
    }
}
