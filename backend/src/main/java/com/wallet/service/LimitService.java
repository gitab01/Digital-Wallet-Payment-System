package com.wallet.service;

import com.wallet.domain.TierLimit;
import com.wallet.error.ApiException;
import com.wallet.repository.TierLimitRepository;
import com.wallet.repository.TransferRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;

/**
 * Tier ceilings, enforced server-side.
 *
 * A limit the client also enforces is a suggestion. These checks run while the
 * sender's account is locked, so the daily total being compared is the total as of
 * the moment this transfer is serialised against every other movement on the
 * account rather than a number read earlier.
 *
 * Ceilings are applied per currency: there is no FX rate capture in this build, so
 * converting a USD spend into an ETB ceiling would invent a rate. Currency limits
 * are the first item on the roadmap for exactly that reason.
 */
@Service
public class LimitService {

    public record Spent(long todayCents, long monthCents) {}

    private final TierLimitRepository tiers;
    private final TransferRepository transfers;

    public LimitService(TierLimitRepository tiers, TransferRepository transfers) {
        this.tiers = tiers;
        this.transfers = transfers;
    }

    public TierLimit limitsFor(int tier) {
        return tiers.findById(tier).orElseThrow(() -> ApiException.of(
                HttpStatus.INTERNAL_SERVER_ERROR, "LIMITS_UNAVAILABLE",
                "No ceiling is configured for verification tier " + tier + "."));
    }

    public Spent spent(long userId, String currency) {
        Instant now = Instant.now();
        Instant dayStart = LocalDate.ofInstant(now, ZoneOffset.UTC).atStartOfDay(ZoneOffset.UTC).toInstant();
        Instant monthStart = LocalDate.ofInstant(now, ZoneOffset.UTC).withDayOfMonth(1)
                .atStartOfDay(ZoneOffset.UTC).toInstant();
        return new Spent(
                transfers.sumOutflowSince(userId, currency, dayStart),
                transfers.sumOutflowSince(userId, currency, monthStart));
    }

    /**
     * @param totalDebitCents principal plus fee; a ceiling that ignored fees would
     *        let a customer move more than the tier permits.
     */
    public void assertWithinLimits(int tier, String currency, long totalDebitCents, Spent spent) {
        TierLimit limit = limitsFor(tier);

        if (totalDebitCents > limit.getPerTransactionCents()) {
            throw ApiException.limitExceeded("per-transaction", limit.getPerTransactionCents(),
                    0, totalDebitCents);
        }
        if (spent.todayCents() + totalDebitCents > limit.getDailyCents()) {
            throw ApiException.limitExceeded("daily", limit.getDailyCents(),
                    spent.todayCents(), totalDebitCents);
        }
        if (spent.monthCents() + totalDebitCents > limit.getMonthlyCents()) {
            throw ApiException.limitExceeded("monthly", limit.getMonthlyCents(),
                    spent.monthCents(), totalDebitCents);
        }
    }

    public long remainingToday(int tier, String currency, long userId) {
        TierLimit limit = limitsFor(tier);
        long used = transfers.sumOutflowSince(userId, currency,
                LocalDate.ofInstant(Instant.now(), ZoneOffset.UTC)
                        .atStartOfDay(ZoneOffset.UTC).toInstant());
        return Math.max(0, limit.getDailyCents() - used);
    }
}
