package com.wallet.support;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Money is BigDecimal at the boundary and integer cents in storage. Never a float,
 * at any layer, for any reason.
 */
public final class Money {

    public static final int SCALE = 2;

    private Money() {}

    public static long toCents(BigDecimal amount) {
        if (amount == null) throw new IllegalArgumentException("amount is required");
        return amount.movePointRight(SCALE).setScale(0, RoundingMode.UNNECESSARY).longValueExact();
    }

    /** Parses client input. Rejects more than two decimals rather than rounding it away. */
    public static long toCents(String amount) {
        return toCents(new BigDecimal(amount.trim()));
    }

    public static BigDecimal fromCents(long cents) {
        return BigDecimal.valueOf(cents).movePointLeft(SCALE).setScale(SCALE, RoundingMode.UNNECESSARY);
    }

    public static String format(long cents) {
        return fromCents(cents).toPlainString();
    }

    /** Basis-point fee with half-up rounding; the fee floor is added in cents. */
    public static long fee(long principalCents, int basisPoints, long fixedCents) {
        BigDecimal bp = BigDecimal.valueOf(principalCents)
                .multiply(BigDecimal.valueOf(basisPoints))
                .divide(BigDecimal.valueOf(10_000), 0, RoundingMode.HALF_UP);
        return bp.longValueExact() + fixedCents;
    }
}
