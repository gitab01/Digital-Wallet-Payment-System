package com.wallet.service;

import com.wallet.domain.Account;
import com.wallet.domain.AuditLog;
import com.wallet.domain.AuditLog.Outcome;
import com.wallet.domain.KycRecord;
import com.wallet.domain.User;
import com.wallet.error.ApiException;
import com.wallet.repository.AccountRepository;
import com.wallet.repository.AuditLogRepository;
import com.wallet.repository.KycRecordRepository;
import com.wallet.repository.RefreshTokenRepository;
import com.wallet.repository.UserRepository;
import com.wallet.support.Money;
import com.wallet.support.PageView;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * The review desk and the support desk, in one service because in this deployment they
 * are the same person.
 *
 * Everything here acts on somebody else's account, which is exactly why every write is
 * audited with the reviewer's identity in the detail: an operator console with no trail
 * of what its operators did is an unaccountable backdoor with a nicer interface.
 */
@Service
public class AdminService {

    public record WalletBalance(String currency, String balance) {}

    public record ClientRow(Long id, String email, String fullName, int kycTier, String status,
                            boolean withdrawalsFrozen, Instant createdAt, List<WalletBalance> wallets) {}

    public record AdminUserView(Long id, String email, String fullName, int kycTier, String status,
                                boolean withdrawalsFrozen, int failedPinAttempts, Instant pinLockedUntil,
                                Instant createdAt) {}

    public record ClientView(AdminUserView user, List<WalletBalance> wallets,
                             WalletQueryService.LimitView limits, List<KycService.Submission> kyc,
                             List<WalletQueryService.TransactionRow> recent) {}

    public record QueueItem(Long recordId, Long userId, int tier, String email, String fullName,
                            String documentType, String last4, Instant submittedAt, List<String> missing,
                            Long duplicateOfUserId, boolean ownSubmission) {}

    public record AuditRow(Long id, String userEmail, String action, String outcome, String ipAddress,
                           Instant createdAt, String detail) {}

    /** Suspension is the operator's lever; CLOSED is a lifecycle end, not a support tool. */
    private static final Set<User.Status> SETTABLE_STATUS = Set.of(User.Status.SUSPENDED, User.Status.ACTIVE);
    private static final int RECENT_SIZE = 10;

    private final UserRepository users;
    private final AccountRepository accounts;
    private final KycRecordRepository records;
    private final AuditLogRepository auditLog;
    private final RefreshTokenRepository refreshTokens;
    private final KycService kyc;
    private final KycDocumentService documents;
    private final WalletQueryService queries;
    private final AuditService audit;

    public AdminService(UserRepository users, AccountRepository accounts, KycRecordRepository records,
                        AuditLogRepository auditLog, RefreshTokenRepository refreshTokens, KycService kyc,
                        KycDocumentService documents, WalletQueryService queries, AuditService audit) {
        this.users = users;
        this.accounts = accounts;
        this.records = records;
        this.auditLog = auditLog;
        this.refreshTokens = refreshTokens;
        this.kyc = kyc;
        this.documents = documents;
        this.queries = queries;
        this.audit = audit;
    }

    // ------------------------------------------------------------------ queue

    /**
     * Oldest first, with the two things a number cannot tell a reviewer: which sides of
     * the document are still missing, and whether somebody else has already filed this
     * exact image.
     */
    @Transactional(readOnly = true)
    public List<QueueItem> queue(Long reviewerId) {
        List<KycRecord> open = records.findByStatusOrderByIdAsc(KycRecord.Status.SUBMITTED);
        Map<Long, User> people = usersById(open.stream().map(KycRecord::getUserId).toList());
        Map<Long, KycDocumentService.QueueFacts> facts = documents.factsFor(open);

        List<QueueItem> items = new ArrayList<>();
        for (KycRecord record : open) {
            User subject = people.get(record.getUserId());
            KycDocumentService.QueueFacts fact =
                    facts.getOrDefault(record.getId(), KycDocumentService.QueueFacts.COMPLETE);
            items.add(new QueueItem(record.getId(), record.getUserId(), record.getTier(),
                    subject == null ? "?" : subject.getEmail(),
                    subject == null ? "deleted account" : subject.getFullName(),
                    record.getDocumentType(), record.getDocumentLast4(), record.getSubmittedAt(),
                    fact.missingSides(), fact.duplicateOfUserId(),
                    record.getUserId().equals(reviewerId)));
        }
        return items;
    }

    // ---------------------------------------------------------------- clients

    @Transactional(readOnly = true)
    public PageView<ClientRow> clients(String query, String status, int page, int size) {
        User.Status asStatus = parseStatus(status, true);
        String pattern = likePattern(query);

        Specification<User> filter = (root, cq, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (pattern != null) {
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("email")), pattern, LIKE_ESCAPE),
                        cb.like(cb.lower(root.get("fullName")), pattern, LIKE_ESCAPE)));
            }
            if (asStatus != null) {
                predicates.add(cb.equal(root.get("status"), asStatus));
            }
            return predicates.isEmpty() ? cb.conjunction() : cb.and(predicates.toArray(new Predicate[0]));
        };

        Page<User> found = users.findAll(filter,
                PageRequest.of(Math.max(0, page), clampSize(size), Sort.by(Sort.Direction.DESC, "id")));

        Map<Long, List<Account>> wallets = groupWallets(found.getContent().stream().map(User::getId).toList());
        List<ClientRow> items = found.getContent().stream()
                .map(u -> new ClientRow(u.getId(), u.getEmail(), u.getFullName(), u.getKycTier(),
                        u.getStatus().name(), u.isWithdrawalsFrozen(), u.getCreatedAt(),
                        wallets.getOrDefault(u.getId(), List.of()).stream()
                                .map(a -> new WalletBalance(a.getCurrency(), Money.format(a.getBalanceCents())))
                                .toList()))
                .toList();
        return new PageView<>(items, found.getTotalElements(), found.getNumber(), found.getSize());
    }

    @Transactional(readOnly = true)
    public ClientView client(Long userId) {
        User user = require(userId);
        return new ClientView(adminView(user),
                walletsOf(userId).stream()
                        .map(a -> new WalletBalance(a.getCurrency(), Money.format(a.getBalanceCents())))
                        .toList(),
                queries.limitView(user, WalletQueryService.SUMMARY_CURRENCY),
                kyc.history(userId),
                queries.rows(userId, queries.page(userId, null, null, null, 0, RECENT_SIZE)));
    }

    // ---------------------------------------------------------------- decisions

    /**
     * Suspension revokes every refresh token the customer holds, so their sessions
     * expire instead of renewing and their next sign-in is refused outright. It does not
     * reach an access token already in the wild: those stay valid for their TTL, and that
     * is survivable only because requireActive() inside the ledger refuses to move money
     * for a frozen account whatever token the request arrives on.
     */
    @Transactional
    public AdminUserView setStatus(Long userId, String rawStatus, Long reviewerId) {
        User.Status status = parseStatus(rawStatus, false);
        if (!SETTABLE_STATUS.contains(status)) {
            throw ApiException.validation("status must be SUSPENDED or ACTIVE.", Map.of("status", rawStatus));
        }
        User user = require(userId);
        if (user.getStatus() == status) {
            throw ApiException.conflict("ALREADY_IN_STATE", "That account is already " + status + ".");
        }

        user.setStatus(status);
        users.saveAndFlush(user);
        if (status == User.Status.SUSPENDED) refreshTokens.revokeAllForUser(userId);

        record(userId, reviewerId, "status " + status);
        return adminView(user);
    }

    @Transactional
    public AdminUserView freezeWithdrawals(Long userId, boolean frozen, Long reviewerId) {
        User user = require(userId);
        user.setWithdrawalsFrozen(frozen);
        users.saveAndFlush(user);
        record(userId, reviewerId, (frozen ? "withdrawals frozen" : "withdrawals unfrozen"));
        return adminView(user);
    }

    /**
     * For a customer who locked themselves out and proved who they are some other way.
     * Written through the entity rather than the bulk UPDATE the PIN service uses,
     * because this transaction has already loaded the row and the version column has to
     * move with it.
     */
    @Transactional
    public AdminUserView unlockPin(Long userId, Long reviewerId) {
        User user = require(userId);
        user.setFailedPinAttempts(0);
        user.setPinLockedUntil(null);
        users.saveAndFlush(user);
        record(userId, reviewerId, "pin lock cleared");
        return adminView(user);
    }

    // ------------------------------------------------------------------ audit

    @Transactional(readOnly = true)
    public PageView<AuditRow> audit(String action, int page, int size) {
        String normalised = action == null || action.isBlank() ? null : action.trim().toUpperCase();
        Specification<AuditLog> filter = (root, cq, cb) -> normalised == null
                ? cb.conjunction()
                : cb.equal(root.get("action"), normalised);

        Page<AuditLog> found = auditLog.findAll(filter,
                PageRequest.of(Math.max(0, page), clampSize(size), Sort.by(Sort.Direction.DESC, "id")));

        Map<Long, User> people = usersById(found.getContent().stream()
                .map(AuditLog::getUserId).filter(Objects::nonNull).toList());

        return new PageView<>(found.getContent().stream()
                .map(row -> {
                    User subject = row.getUserId() == null ? null : people.get(row.getUserId());
                    return new AuditRow(row.getId(), subject == null ? null : subject.getEmail(),
                            row.getAction(), row.getOutcome().name(), row.getIpAddress(), row.getCreatedAt(),
                            row.getDetail());
                })
                .toList(), found.getTotalElements(), found.getNumber(), found.getSize());
    }

    public List<KycDocumentService.View> documentsFor(Long recordId) {
        records.findById(recordId)
                .orElseThrow(() -> ApiException.notFound("KYC_NOT_FOUND", "No such verification record."));
        return documents.forRecord(recordId);
    }

    // ------------------------------------------------------------------ shared

    private void record(Long userId, Long reviewerId, String what) {
        audit.record(AuditService.Action.ADMIN_CLIENT_UPDATED, Outcome.SUCCESS, userId,
                what + " by reviewer " + reviewerId);
    }

    private User require(Long id) {
        return users.findById(id)
                .orElseThrow(() -> ApiException.notFound("USER_NOT_FOUND", "No such customer."));
    }

    private List<Account> walletsOf(Long userId) {
        return accounts.findByUserIdAndKindOrderByCurrencyAsc(userId, Account.Kind.CUSTOMER_WALLET);
    }

    private Map<Long, List<Account>> groupWallets(List<Long> userIds) {
        if (userIds.isEmpty()) return Map.of();
        return accounts.findByUserIdInAndKindOrderByUserIdAscCurrencyAsc(userIds, Account.Kind.CUSTOMER_WALLET)
                .stream()
                .collect(Collectors.groupingBy(Account::getUserId, LinkedHashMap::new, Collectors.toList()));
    }

    private Map<Long, User> usersById(List<Long> ids) {
        LinkedHashSet<Long> unique = new LinkedHashSet<>(ids);
        if (unique.isEmpty()) return Map.of();
        return users.findAllById(unique).stream().collect(Collectors.toMap(User::getId, Function.identity()));
    }

    private static AdminUserView adminView(User u) {
        return new AdminUserView(u.getId(), u.getEmail(), u.getFullName(), u.getKycTier(), u.getStatus().name(),
                u.isWithdrawalsFrozen(), u.getFailedPinAttempts(), u.getPinLockedUntil(), u.getCreatedAt());
    }

    private static User.Status parseStatus(String raw, boolean allowEmpty) {
        if (raw == null || raw.isBlank()) {
            if (allowEmpty) return null;
            throw ApiException.validation("A status is required.", Map.of());
        }
        try {
            return User.Status.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            throw ApiException.validation("Unknown status " + raw + ".", Map.of("status", raw));
        }
    }

    private static int clampSize(int size) {
        return Math.min(100, Math.max(1, size));
    }

    /** Null when there is nothing to match on, so the specification can skip the predicate. */
    private static String likePattern(String query) {
        if (query == null || query.isBlank()) return null;
        // Escaped with the same character the predicate declares, because SQL Server has
        // no default escape: without this, searching for "100%" silently becomes a
        // wildcard the operator never meant to ask for.
        String cleaned = query.trim().toLowerCase()
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
        return "%" + cleaned + "%";
    }

    private static final char LIKE_ESCAPE = '\\';
}
