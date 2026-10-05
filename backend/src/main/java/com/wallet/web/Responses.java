package com.wallet.web;

import com.wallet.domain.AuditLog;
import com.wallet.domain.User;
import com.wallet.service.AuthService;
import com.wallet.service.KycService;
import com.wallet.service.WalletQueryService;

import java.time.Instant;
import java.util.List;

/** Outbound shapes. Money is always a two-decimal string; see API.md. */
public final class Responses {

    private Responses() {}

    public record UserView(Long id, String email, String fullName, int kycTier, String status) {}

    public record SessionView(UserView user, AuthService.Tokens tokens) {}

    public record PageView<T>(List<T> items, long total, int page, int size) {}

    public record AuditRow(String action, String outcome, String ipAddress, Instant createdAt, String detail) {}

    public record KycView(int tier, String status, Instant submittedAt, Instant reviewedAt,
                          List<KycService.Submission> documents,
                          WalletQueryService.LimitView limits, int nextTier) {}

    /** Document numbers are never returned; last four digits is enough to identify a submission. */
    public record ReviewItem(Long recordId, int tier, String email, String fullName, String documentType,
                             String last4, Instant submittedAt) {}

    public static UserView user(User user) {
        return new UserView(user.getId(), user.getEmail(), user.getFullName(), user.getKycTier(),
                user.getStatus().name());
    }

    public static AuditRow audit(AuditLog row) {
        return new AuditRow(row.getAction(), row.getOutcome().name(), row.getIpAddress(), row.getCreatedAt(),
                row.getDetail());
    }
}
