package com.wallet.service;

import com.wallet.domain.AuditLog;
import com.wallet.repository.AuditLogRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Records intent and access, never money.
 *
 * Success rows share the caller's transaction so they describe what actually
 * happened. Denials are written separately so they survive the rollback of the
 * transaction that rejected them, which is the event an investigator needs to find.
 */
@Service
public class AuditService {

    private static final Logger log = LoggerFactory.getLogger(AuditService.class);

    public enum Action {
        REGISTER, LOGIN, LOGIN_FAILED, LOGOUT, TOKEN_REFRESH, TOKEN_REUSE_DETECTED,
        PIN_FAILURE, PIN_LOCKOUT, PIN_CHANGED, KYC_SUBMITTED, KYC_DECIDED,
        KYC_DOCUMENT_UPLOADED, KYC_DOCUMENT_VIEWED, ADMIN_CLIENT_UPDATED, ADMIN_DECISION,
        TRANSFER, DEPOSIT, WITHDRAWAL, LIMIT_BREACH, RECONCILIATION_DRIFT, RATE_LIMITED
    }

    private final AuditLogRepository audit;

    public AuditService(AuditLogRepository audit) {
        this.audit = audit;
    }

    /**
     * Success records join the caller's transaction so they commit or vanish with the
     * money they describe. An audit trail that claims a transfer succeeded when the
     * transaction rolled back is worse than no trail at all.
     */
    @Transactional
    public void record(Action action, AuditLog.Outcome outcome, Long userId, String detail) {
        write(action, outcome, userId, detail);
    }

    /**
     * Denials and failures are written in their own transaction because they usually
     * occur just before the caller's transaction rolls back. A rejected PIN attempt
     * or a limit breach is exactly the event an investigator needs to still find.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordDetached(Action action, AuditLog.Outcome outcome, Long userId, String detail) {
        write(action, outcome, userId, detail);
    }

    private void write(Action action, AuditLog.Outcome outcome, Long userId, String detail) {
        AuditLog row = new AuditLog();
        row.setAction(action.name());
        row.setOutcome(outcome);
        row.setUserId(userId);
        row.setDetail(truncate(detail, 512));

        HttpServletRequest request = currentRequest();
        if (request != null) {
            row.setIpAddress(clientIp(request));
            row.setUserAgent(truncate(request.getHeader("User-Agent"), 256));
        }

        try {
            audit.save(row);
        } catch (Exception ex) {
            if (outcome == AuditLog.Outcome.SUCCESS) throw ex;
            // A failed denial record must not mask the rejection the caller is raising.
            log.error("could not write audit row for {} user={}", action, userId, ex);
        }
    }

    private static HttpServletRequest currentRequest() {
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attrs) {
            return attrs.getRequest();
        }
        return null;
    }

    private static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) return truncate(forwarded.split(",")[0].trim(), 45);
        return truncate(request.getRemoteAddr(), 45);
    }

    private static String truncate(String value, int max) {
        if (value == null) return null;
        return value.length() <= max ? value : value.substring(0, max);
    }
}
