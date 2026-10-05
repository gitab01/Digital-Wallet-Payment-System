package com.wallet.service;

import com.wallet.config.WalletProperties;
import com.wallet.domain.Transfer;
import com.wallet.repository.TransferRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.ZoneOffset;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Transaction anomaly flagging: one deliberately conservative model.
 *
 * It builds a behavioural baseline from the user's own completed outflow — typical
 * amount, typical hour, known recipients — scores a candidate transfer against it,
 * and raises a review flag. It never blocks. Automatic blocking produced too many
 * false positives to be trustworthy, so the design keeps a human in the decision
 * and the customer's money moves.
 *
 * A user with too little history is not scored at all. Absence of evidence is not
 * evidence of anomaly.
 */
@Service
public class AnomalyService {

    private static final int HISTORY_WINDOW = 60;

    public record Assessment(BigDecimal score, boolean reviewFlag, List<String> reasons) {}

    private final TransferRepository transfers;
    private final WalletProperties props;

    public AnomalyService(TransferRepository transfers, WalletProperties props) {
        this.transfers = transfers;
        this.props = props;
    }

    public Assessment assess(long userId, Long recipientAccountId, long amountCents, long nowEpochMilli) {
        List<Transfer> history = transfers.recentOutflow(
                userId, PageRequest.of(0, HISTORY_WINDOW));

        if (history.size() < props.getAnomaly().getMinimumHistory()) {
            return new Assessment(null, false, List.of());
        }

        double mean = history.stream().mapToLong(Transfer::getAmountCents).average().orElse(0);
        double sd = standardDeviation(history, mean);

        List<String> reasons = new java.util.ArrayList<>();
        double score = 0;

        // Amount distance from the personal baseline, in standard deviations.
        double amountZ = sd > 0 ? Math.abs(amountCents - mean) / sd : 0;
        if (amountZ >= 2) reasons.add("amount far outside this customer's normal range");
        score += props.getAnomaly().getAmountWeight() * amountZ;

        // Time of day, measured on the circle so 23:00 and 01:00 are near each other.
        double hourMean = history.stream()
                .mapToInt(t -> t.getInitiatedAt().atZone(ZoneOffset.UTC).getHour())
                .average().orElse(12);
        int hour = java.time.Instant.ofEpochMilli(nowEpochMilli).atZone(ZoneOffset.UTC).getHour();
        double hourDistance = Math.min(Math.abs(hour - hourMean), 24 - Math.abs(hour - hourMean));
        double hourZ = hourDistance / 6.0;
        if (hourZ >= 1.5) reasons.add("unusual hour of day for this customer");
        score += props.getAnomaly().getHourWeight() * hourZ;

        // First money to a recipient is worth more attention than the tenth.
        Set<Long> known = new HashSet<>();
        for (Transfer t : history) {
            if (t.getToAccountId() != null) known.add(t.getToAccountId());
        }
        boolean newRecipient = recipientAccountId != null && !known.contains(recipientAccountId);
        if (newRecipient) reasons.add("first transfer to this recipient");
        score += props.getAnomaly().getNewRecipientWeight() * (newRecipient ? 1 : 0);

        BigDecimal scaled = BigDecimal.valueOf(score).setScale(4, RoundingMode.HALF_UP);
        boolean flag = scaled.doubleValue() >= props.getAnomaly().getZThreshold();
        return new Assessment(scaled, flag, reasons);
    }

    private static double standardDeviation(List<Transfer> history, double mean) {
        double variance = history.stream()
                .mapToDouble(t -> {
                    double d = t.getAmountCents() - mean;
                    return d * d;
                })
                .sum() / history.size();
        return Math.sqrt(variance);
    }
}
