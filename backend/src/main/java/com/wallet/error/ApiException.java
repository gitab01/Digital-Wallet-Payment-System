package com.wallet.error;

import org.springframework.http.HttpStatus;

import java.util.Map;

/**
 * Domain failures carry a machine-readable code and the HTTP status that code must
 * produce. The client switches on the code, so the mapping is part of the contract
 * and lives in one place rather than being guessed at each call site.
 */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;
    private final Map<String, Object> details;

    public ApiException(HttpStatus status, String code, String message, Map<String, Object> details) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details == null ? Map.of() : details;
    }

    public HttpStatus getStatus() { return status; }
    public String getCode() { return code; }
    public Map<String, Object> getDetails() { return details; }

    public static ApiException of(HttpStatus status, String code, String message) {
        return new ApiException(status, code, message, Map.of());
    }

    public static ApiException of(HttpStatus status, String code, String message, Map<String, Object> details) {
        return new ApiException(status, code, message, details);
    }

    public static ApiException validation(String message, Map<String, Object> details) {
        return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", message, details);
    }

    public static ApiException notFound(String code, String message) {
        return new ApiException(HttpStatus.NOT_FOUND, code, message, Map.of());
    }

    public static ApiException conflict(String code, String message) {
        return new ApiException(HttpStatus.CONFLICT, code, message, Map.of());
    }

    public static ApiException insufficientFunds(long neededCents, long availableCents) {
        return new ApiException(HttpStatus.CONFLICT, "INSUFFICIENT_FUNDS",
                "The wallet does not cover this amount and its fee.",
                Map.of("needed", neededCents, "available", availableCents));
    }

    public static ApiException limitExceeded(String limitName, long limitCents, long spentCents, long requestedCents) {
        return new ApiException(HttpStatus.FORBIDDEN, "LIMIT_EXCEEDED",
                "This transfer exceeds the " + limitName + " ceiling for your verification tier.",
                Map.of("limit", limitName, "limitCents", limitCents,
                        "spentCents", spentCents, "requestedCents", requestedCents));
    }

    public static ApiException pinInvalid(int attemptsLeft) {
        return new ApiException(HttpStatus.UNAUTHORIZED, "PIN_INVALID",
                "That PIN is not correct.", Map.of("attemptsLeft", attemptsLeft));
    }

    public static ApiException pinLocked(String unlockedAt) {
        return new ApiException(HttpStatus.FORBIDDEN, "PIN_LOCKED",
                "Too many incorrect PIN attempts. Try again later.",
                Map.of("unlockedAt", unlockedAt));
    }
}
