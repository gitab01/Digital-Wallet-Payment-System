package com.wallet.service;

import com.fasterxml.jackson.annotation.JsonUnwrapped;
import com.wallet.domain.Account;
import com.wallet.domain.AuditLog;
import com.wallet.domain.LedgerEntry;
import com.wallet.domain.ReconciliationRun;
import com.wallet.domain.TierLimit;
import com.wallet.domain.Transfer;
import com.wallet.domain.User;
import com.wallet.error.ApiException;
import com.wallet.repository.AccountRepository;
import com.wallet.repository.AuditLogRepository;
import com.wallet.repository.LedgerEntryRepository;
import com.wallet.repository.ReconciliationRunRepository;
import com.wallet.repository.TransferRepository;
import com.wallet.repository.UserRepository;
import com.wallet.support.Money;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Everything the client reads, derived from the ledger and its projections.
 *
 * Balances here come from the cached projection column, never recomputed per request;
 * the `reconciled` flag is what tells the user how recently that projection was proved
 * against the entry history. A balance shown without that proof is still a balance,
 * but it is not a verified one.
 */
@Service
public class WalletQueryService {

    public record AccountView(Long id, String currency, String label, String balance, String available,
                              Instant verifiedAt, boolean reconciled) {}

    public record LimitView(String perTransaction, String daily, String monthly, String spentToday,
                            String spentThisMonth, String remainingToday, boolean allowsWithdrawal) {}

    public record TransactionRow(String reference, String type, String direction, String currency, String amount,
                                 String fee, String status, Instant occurredAt, String counterparty,
                                 boolean reviewFlag, List<Long> ledgerEntryIds) {}

    public record EntryView(Long id, Long accountId, String accountLabel, String amount, String role,
                            String balanceAfter, Instant createdAt) {}

    /**
     * API.md promises the movement's own fields flat alongside the ledger detail, so the
     * row is unwrapped rather than nested: a client reading one of these should not have
     * to declare the row's fields twice, once nested and once not.
     */
    public record TransactionDetail(@JsonUnwrapped TransactionRow row, Long senderAccountId,
                                    Long recipientAccountId,
                                    Instant initiatedAt, Instant completedAt, java.math.BigDecimal anomalyScore,
                                    List<EntryView> entries) {}

    public record WalletView(List<AccountView> accounts, int tier, LimitView limits,
                             Map<String, LimitView> limitsByCurrency, boolean withdrawalsFrozen,
                             List<TransactionRow> recent) {}

    private static final String SUMMARY_CURRENCY = "ETB";
    private static final int RECENT_SIZE = 12;

    private final UserRepository users;
    private final AccountRepository accounts;
    private final TransferRepository transfers;
    private final LedgerEntryRepository entries;
    private final AuditLogRepository auditLog;
    private final ReconciliationRunRepository reconciliations;
    private final LimitService limits;

    public WalletQueryService(UserRepository users, AccountRepository accounts, TransferRepository transfers,
                              LedgerEntryRepository entries, AuditLogRepository auditLog,
                              ReconciliationRunRepository reconciliations, LimitService limits) {
        this.users = users;
        this.accounts = accounts;
        this.transfers = transfers;
        this.entries = entries;
        this.auditLog = auditLog;
        this.reconciliations = reconciliations;
        this.limits = limits;
    }

    @Transactional(readOnly = true)
    public WalletView wallet(Long userId) {
        User user = requireUser(userId);
        List<Account> wallets = accounts.findByUserIdAndKindOrderByCurrencyAsc(userId, Account.Kind.CUSTOMER_WALLET);

        List<AccountView> views = wallets.stream()
                .map(a -> new AccountView(a.getId(), a.getCurrency(), a.getLabel(),
                        Money.format(a.getBalanceCents()), Money.format(a.getBalanceCents()),
                        a.getProjectionAt(), isReconciled(a.getId())))
                .toList();

        Map<String, LimitView> byCurrency = new LinkedHashMap<>();
        for (Account wallet : wallets) {
            byCurrency.put(wallet.getCurrency(), limitView(user, wallet.getCurrency()));
        }

        return new WalletView(views, user.getKycTier(),
                byCurrency.getOrDefault(SUMMARY_CURRENCY, limitView(user, SUMMARY_CURRENCY)),
                byCurrency, user.isWithdrawalsFrozen(),
                rows(userId, page(userId, null, null, null, 0, RECENT_SIZE)));
    }

    public LimitView limitView(User user, String currency) {
        TierLimit ceiling = limits.limitsFor(user.getKycTier());
        LimitService.Spent spent = limits.spent(user.getId(), currency);
        long remaining = Math.max(0, ceiling.getDailyCents() - spent.todayCents());
        return new LimitView(Money.format(ceiling.getPerTransactionCents()), Money.format(ceiling.getDailyCents()),
                Money.format(ceiling.getMonthlyCents()), Money.format(spent.todayCents()),
                Money.format(spent.monthCents()), Money.format(remaining), ceiling.isAllowsWithdrawal());
    }

    /**
     * Verified means "the last time this projection was recomputed from its entries,
     * it agreed". Anything else, including never having been checked, is not verified.
     */
    private boolean isReconciled(Long accountId) {
        List<ReconciliationRun> runs =
                reconciliations.findByAccountIdOrderByRanAtDesc(accountId, PageRequest.of(0, 1));
        return !runs.isEmpty() && runs.get(0).getOutcome() == ReconciliationRun.Outcome.MATCHED;
    }

    @Transactional
    public AccountView openAccount(Long userId, String currency) {
        String code = currency == null ? "" : currency.trim().toUpperCase();
        if (!AuthService.SUPPORTED_CURRENCIES.contains(code)) {
            throw ApiException.of(HttpStatus.BAD_REQUEST, "UNSUPPORTED_CURRENCY",
                    "Supported currencies: " + AuthService.SUPPORTED_CURRENCIES);
        }
        if (accounts.findByUserIdAndCurrencyAndKind(userId, code, Account.Kind.CUSTOMER_WALLET).isPresent()) {
            throw ApiException.conflict("ACCOUNT_EXISTS", "That wallet is already open.");
        }

        Account wallet = new Account();
        wallet.setUserId(userId);
        wallet.setCurrency(code);
        wallet.setKind(Account.Kind.CUSTOMER_WALLET);
        wallet.setLabel(code + " wallet");
        wallet.setBalanceCents(0);
        wallet.setProjectionAt(Instant.now());
        accounts.saveAndFlush(wallet);

        return new AccountView(wallet.getId(), wallet.getCurrency(), wallet.getLabel(),
                Money.format(wallet.getBalanceCents()), Money.format(wallet.getBalanceCents()),
                wallet.getProjectionAt(), false);
    }

    @Transactional(readOnly = true)
    public Page<Transfer> page(Long userId, Long accountId, Instant from, Instant to, int page, int size) {
        requireUser(userId);
        Instant start = from == null ? Instant.EPOCH.plusMillis(1) : from;
        Instant end = to == null ? Instant.now() : to;
        return transfers.search(userId, accountId, start, end,
                PageRequest.of(Math.max(0, page), Math.min(100, Math.max(1, size)),
                        Sort.by(Sort.Direction.DESC, "initiatedAt")));
    }

    /** Turns a page of transfers into client rows, with their entry ids in one read. */
    public List<TransactionRow> rows(Long viewerId, Page<Transfer> found) {
        List<Transfer> content = found.getContent();
        if (content.isEmpty()) return List.of();

        Map<Long, List<Long>> entryIds = new LinkedHashMap<>();
        entries.findByTransferIdInOrderByIdAsc(content.stream().map(Transfer::getId).toList())
                .forEach(e -> entryIds.computeIfAbsent(e.getTransferId(), k -> new ArrayList<>()).add(e.getId()));

        return content.stream()
                .map(t -> new TransactionRow(t.getReference(), t.getType().name(), direction(viewerId, t),
                        t.getCurrency(), Money.format(t.getAmountCents()), Money.format(t.getFeeCents()),
                        t.getStatus().name(), t.getCompletedAt() == null ? t.getInitiatedAt() : t.getCompletedAt(),
                        counterparty(viewerId, t), t.isReviewFlag(),
                        entryIds.getOrDefault(t.getId(), List.of())))
                .toList();
    }

    @Transactional(readOnly = true)
    public TransactionDetail detail(Long viewerId, String reference) {
        Transfer transfer = transfers.findByReference(reference)
                .orElseThrow(() -> ApiException.notFound("TRANSFER_NOT_FOUND", "No transaction with that reference."));
        // The reference is quotable in a conversation, so it must not be a way to read
        // somebody else's money history.
        if (!transfer.getOwnerUserId().equals(viewerId) && !touches(viewerId, transfer)) {
            throw ApiException.notFound("TRANSFER_NOT_FOUND", "No transaction with that reference.");
        }

        List<LedgerEntry> legs = entries.findByTransferIdOrderByIdAsc(transfer.getId());
        List<EntryView> entryViews = legs.stream()
                .map(e -> new EntryView(e.getId(), e.getAccountId(), labelOf(e.getAccountId()),
                        Money.format(e.getAmountCents()), e.getRole().name(),
                        Money.format(e.getBalanceAfterCents()), e.getCreatedAt()))
                .toList();

        TransactionRow row = new TransactionRow(transfer.getReference(), transfer.getType().name(),
                direction(viewerId, transfer), transfer.getCurrency(),
                Money.format(transfer.getAmountCents()), Money.format(transfer.getFeeCents()),
                transfer.getStatus().name(),
                transfer.getCompletedAt() == null ? transfer.getInitiatedAt() : transfer.getCompletedAt(),
                counterparty(viewerId, transfer), transfer.isReviewFlag(),
                legs.stream().map(LedgerEntry::getId).toList());

        return new TransactionDetail(row, transfer.getFromAccountId(), transfer.getToAccountId(),
                transfer.getInitiatedAt(), transfer.getCompletedAt(), transfer.getAnomalyScore(), entryViews);
    }

    @Transactional(readOnly = true)
    public List<AuditLog> recentAudit(Long userId, int size) {
        return auditLog.findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, Math.min(100, Math.max(1, size))));
    }

    /**
     * Direction is from the viewer's point of view, not the transfer's: the same row
     * is OUT for the sender and IN for the recipient, and the statement a customer
     * exports must read the way they experienced it.
     */
    private String direction(Long viewerId, Transfer t) {
        return switch (t.getType()) {
            case DEPOSIT -> "IN";
            case WITHDRAWAL -> "OUT";
            case TRANSFER -> owns(viewerId, t.getFromAccountId()) ? "OUT" : "IN";
        };
    }

    private String counterparty(Long viewerId, Transfer t) {
        Long other = owns(viewerId, t.getFromAccountId()) ? t.getToAccountId() : t.getFromAccountId();
        if (other == null) {
            return switch (t.getType()) {
                case DEPOSIT -> "Funding provider";
                case WITHDRAWAL -> "Cash out";
                case TRANSFER -> "Counterparty";
            };
        }
        return labelOf(other);
    }

    private String labelOf(Long accountId) {
        Optional<Account> account = accounts.findById(accountId);
        if (account.isEmpty()) return "Closed wallet";
        Account a = account.get();
        if (a.getUserId() == null) return a.getLabel();
        return users.findById(a.getUserId()).map(User::getFullName).orElse(a.getLabel());
    }

    private boolean owns(Long userId, Long accountId) {
        if (accountId == null) return false;
        return accounts.findById(accountId).map(a -> userId.equals(a.getUserId())).orElse(false);
    }

    private boolean touches(Long userId, Transfer t) {
        return owns(userId, t.getFromAccountId()) || owns(userId, t.getToAccountId());
    }

    private User requireUser(Long userId) {
        return users.findById(userId)
                .orElseThrow(() -> ApiException.notFound("USER_NOT_FOUND", "No customer for this session."));
    }
}
