package com.wallet.support;

import com.wallet.error.ApiException;
import org.springframework.http.HttpStatus;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;

/**
 * Range parameters accept either a bare date or a full timestamp, because
 * "2026-10-01 to 2026-10-05" is how a person thinks about a statement while the
 * ledger stores instants. A bare date is inclusive of the whole day in UTC.
 */
public final class Times {

    private Times() {}

    public static Instant lowerBound(String value) {
        return bound(value, LocalTime.MIN);
    }

    public static Instant upperBound(String value) {
        return bound(value, LocalTime.MAX);
    }

    private static Instant bound(String value, LocalTime dayBoundary) {
        if (value == null || value.isBlank()) return null;
        try {
            return value.length() <= 10
                    ? LocalDate.parse(value).atTime(dayBoundary).toInstant(ZoneOffset.UTC)
                    : Instant.parse(value);
        } catch (Exception ex) {
            throw ApiException.of(HttpStatus.BAD_REQUEST, "INVALID_DATE",
                    "Dates must be yyyy-MM-dd or an ISO-8601 instant.");
        }
    }
}
