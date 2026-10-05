package com.wallet.service;

import com.wallet.config.WalletProperties;
import com.wallet.domain.Account;
import com.wallet.domain.AuditLog;
import com.wallet.domain.LedgerEntry;
import com.wallet.domain.TierLimit;
import com.wallet.domain.Transfer;
import com.wallet.domain.User;
import com.wallet.error.ApiException;
import com.wallet.repository.AccountRepository;
import com.wallet.repository.TransferRepository;
import com.wallet.repository.UserRepository;
import com.wallet.support.Money;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Every movement of money in the system goes through here.
 *
 * The order of operations is the invariant. Accounts are locked in ascending id
 * order before anything is read, so two reciprocal transfers cannot each hold one
 * lock and wait for the other. The PIN and the tier ceilings are checked while those
 * locks are held, which is what makes the daily total meaningful rather than
 * historical. All legs then post as one statement so the database's posting guards
 * evaluate a complete transfer, the projection is maintained in the same
 * transaction, and only then is the transfer promoted to COMPLETED. If any step
 * fails the transaction rolls back and the money has not moved.
 */
@Service
public class TransferService {

    private static final Logger log = LoggerFactory.getLogger(TransferService.class);

    /** SQL Server deadlock victim. Bounded retry is safe because lock ordering is deterministic. */
    private static final int SQL_DEADLOCK = 1205;
    private static final int MAX_ATTEMPTS = 3;

    private static final String REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final SecureRandom RANDOM = new SecureRandom();

    public enum Rail { TRANSFER, DEPOSIT, WITHDRAWAL }

    public record Result(String reference, String status, boolean replayed, String amount, String fee,
                         String currency, Instant occurredAt, boolean reviewFlag, BigDecimal anomalyScore,
                         String senderBalance, String counterpartyName, List<String> reviewReasons) {}

    public record Quote(String recipientName, String fee, String totalDebit, String senderBalanceAfter,
                        String recipientBalanceAfter, String remainingToday, boolean allowed, String reason) {}

    private final UserRepository users;
    private final AccountRepository accounts;
    private final TransferRepository transfers;
    private final LedgerService ledger;
    private final LimitService limits;
    private final PinService pins;
    private final AnomalyService anomaly;
    private final AuditService audit;
    private final BalanceNotifier notifier;
    private final WalletProperties props;
    private final TransactionTemplate tx;

    public TransferService(UserRepository users, AccountRepository accounts, TransferRepository transfers,
                           LedgerService ledger, LimitService limits, PinService pins, AnomalyService anomaly,
                           AuditService audit, BalanceNotifier notifier, WalletProperties props,
                           TransactionTemplate tx) {
        this.users = users;
        this.accounts = accounts;
        this.transfers = transfers;
        this.ledger = ledger;
        this.limits = limits;
        this.pins = pins;
        this.anomaly = anomaly;
        this.audit = audit;
        this.notifier = notifier;
        this.props = props;
        this.tx = tx;
    }

    // ---------------------------------------------------------------- transfer

    public Result transfer(Long senderId, String toEmail, String currency, long amountCents,
                           String pin, String idempotencyKey) {
        return withDeadlockRetry(() -> doTransfer(senderId, toEmail, currency, amountCents, pin, idempotencyKey));
    }

    private Result doTransfer(Long senderId, String toEmail, String currency, long amountCents,
                              String pin, String idempotencyKey) {
        return tx.execute(status -> {
            User sender = requireUser(senderId);
            requireActive(sender);
            pins.verifyOrThrow(sender, pin);

            if (toEmail == null || toEmail.isBlank() || sender.getEmail().equalsIgnoreCase(toEmail.trim())) {
                throw ApiException.conflict("SELF_TRANSFER", "A wallet cannot pay itself.");
            }

            User recipient = users.findByEmail(toEmail.trim().toLowerCase())
                    .orElseThrow(() -> ApiException.notFound("USER_NOT_FOUND", "No customer with that e-mail."));
            if (recipient.getStatus() != User.Status.ACTIVE && recipient.getStatus() != User.Status.PENDING_KYC) {
                throw ApiException.of(HttpStatus.FORBIDDEN, "ACCOUNT_NOT_ACTIVE", "That wallet cannot receive money.");
            }

            Account from = requireWallet(sender.getId(), currency);
            Account to = requireWallet(recipient.getId(), currency);
            requireNotFrozen(sender);

            // Deterministic acquisition order is the deadlock fix, not an optimisation.
            lockAccounts(List.of(from.getId(), to.getId()));
            long fromStart = lockedBalance(from.getId());
            long totalDebit = amountCents + feeFor(currency, amountCents);
            assertSufficient(from.getId(), totalDebit);
            assertWithinLimits(sender, currency, totalDebit);

            String existing = existingIdempotentResult(sender.getId(), idempotencyKey);
            if (existing != null) return replayed(existing, sender.getId());

            Account feeAccount = feeFor(currency, amountCents) > 0
                    ? requireSystemAccount(Account.Kind.FEE_REVENUE, currency) : null;

            AnomalyService.Assessment assessment = anomaly.assess(
                    sender.getId(), to.getId(), amountCents, System.currentTimeMillis());

            Transfer transfer = newPending(sender.getId(), Rail.TRANSFER, currency, amountCents,
                    idempotencyKey, feeFor(currency, amountCents));
            transfer.setFromAccountId(from.getId());
            transfer.setToAccountId(to.getId());
            if (feeAccount != null) transfer.setFeeAccountId(feeAccount.getId());
            transfer.setAnomalyScore(assessment.score());
            transfer.setReviewFlag(assessment.reviewFlag());
            transfers.saveAndFlush(transfer);

            long fee = transfer.getFeeCents();
            long toStart = lockedBalance(to.getId());

            List<LedgerService.Leg> legs = new ArrayList<>();
            legs.add(new LedgerService.Leg(from.getId(), -amountCents, LedgerEntry.Role.FROM, currency,
                    fromStart - amountCents));
            legs.add(new LedgerService.Leg(to.getId(), amountCents, LedgerEntry.Role.TO, currency,
                    toStart + amountCents));
            if (fee > 0) {
                // The fee is a second debit on the same wallet, so the sender's running
                // balance continues from the principal rather than restarting at it.
                legs.add(new LedgerService.Leg(from.getId(), -fee, LedgerEntry.Role.FEE, currency,
                        fromStart - amountCents - fee));
                legs.add(new LedgerService.Leg(feeAccount.getId(), fee, LedgerEntry.Role.FEE_REVENUE, currency,
                        bumpShared(feeAccount.getId(), fee)));
            }
            ledger.post(transfer.getId(), legs);

            applyProjections(Map.of(from.getId(), -amountCents - fee, to.getId(), amountCents));

            complete(transfer);

            Instant at = Instant.now();
            long senderAfter = fromStart - amountCents - fee;
            long recipientAfter = toStart + amountCents;

            notifier.balance(sender.getId(), new BalanceNotifier.BalancePush(
                    from.getId(), currency, Money.format(senderAfter), Money.format(senderAfter),
                    at, transfer.getReference(), at));
            notifier.balance(recipient.getId(), new BalanceNotifier.BalancePush(
                    to.getId(), currency, Money.format(recipientAfter), Money.format(recipientAfter),
                    at, transfer.getReference(), at));
            notifier.transaction(sender.getId(), transactionPush(transfer, Rail.TRANSFER, "OUT",
                    recipient.getFullName()));
            notifier.transaction(recipient.getId(), transactionPush(transfer, Rail.TRANSFER, "IN",
                    sender.getFullName()));

            audit.record(auditAction(Rail.TRANSFER), AuditLog.Outcome.SUCCESS, sender.getId(),
                    transfer.getReference() + " " + currency + " " + Money.format(amountCents));

            return new Result(transfer.getReference(), "COMPLETED", false,
                    Money.format(amountCents), Money.format(fee), currency, at,
                    transfer.isReviewFlag(), transfer.getAnomalyScore(),
                    Money.format(senderAfter), recipient.getFullName(), assessment.reasons());
        });
    }

    // ------------------------------------------------------------------- funds

    public Result deposit(Long userId, String currency, long amountCents, String pin, String key) {
        return withDeadlockRetry(() -> tx.execute(status -> {
            User user = requireUser(userId);
            requireActive(user);
            pins.verifyOrThrow(user, pin);

            Account wallet = requireWallet(userId, currency);
            Account provider = requireSystemAccount(Account.Kind.CASH_IN_PROVIDER, currency);
            lockAccounts(List.of(wallet.getId()));

            if (existingIdempotentResult(userId, key) != null) {
                return replayed(existingIdempotentResult(userId, key), userId);
            }

            Transfer transfer = newPending(userId, Rail.DEPOSIT, currency, amountCents, key, 0);
            transfer.setToAccountId(wallet.getId());
            transfers.saveAndFlush(transfer);

            long start = lockedBalance(wallet.getId());
            ledger.post(transfer.getId(), List.of(
                    new LedgerService.Leg(wallet.getId(), amountCents, LedgerEntry.Role.CASH_IN, currency,
                            start + amountCents),
                    // The provider is funded from outside the system; its projection runs
                    // negative by design, which is what makes the credit above real.
                    new LedgerService.Leg(provider.getId(), -amountCents, LedgerEntry.Role.CASH_IN, currency,
                            bumpShared(provider.getId(), -amountCents))));

            applyProjections(Map.of(wallet.getId(), amountCents));
            complete(transfer);

            Instant at = Instant.now();
            notifier.balance(userId, new BalanceNotifier.BalancePush(wallet.getId(), currency,
                    Money.format(start + amountCents), Money.format(start + amountCents),
                    at, transfer.getReference(), at));
            notifier.transaction(userId, transactionPush(transfer, Rail.DEPOSIT, "IN", "Funding provider"));
            audit.record(AuditService.Action.DEPOSIT, AuditLog.Outcome.SUCCESS, userId,
                    transfer.getReference() + " " + currency + " " + Money.format(amountCents));

            return new Result(transfer.getReference(), "COMPLETED", false, Money.format(amountCents),
                    "0.00", currency, at, false, null, Money.format(start + amountCents),
                    "Funding provider", List.of());
        }));
    }

    public Result withdraw(Long userId, String currency, long amountCents, String pin, String key) {
        return withDeadlockRetry(() -> tx.execute(status -> {
            User user = requireUser(userId);
            requireActive(user);
            pins.verifyOrThrow(user, pin);
            requireNotFrozen(user);

            TierLimit limit = limits.limitsFor(user.getKycTier());
            if (!limit.isAllowsWithdrawal()) {
                throw ApiException.of(HttpStatus.FORBIDDEN, "TIER_NOT_PERMITTED",
                        "Cash withdrawal needs a higher verification tier.");
            }

            Account wallet = requireWallet(userId, currency);
            Account provider = requireSystemAccount(Account.Kind.CASH_IN_PROVIDER, currency);
            lockAccounts(List.of(wallet.getId()));

            long totalDebit = amountCents + feeFor(currency, amountCents);
            assertSufficient(wallet.getId(), totalDebit);
            assertWithinLimits(user, currency, totalDebit);

            if (existingIdempotentResult(userId, key) != null) {
                return replayed(existingIdempotentResult(userId, key), userId);
            }

            long fee = feeFor(currency, amountCents);
            Account feeAccount = fee > 0 ? requireSystemAccount(Account.Kind.FEE_REVENUE, currency) : null;

            Transfer transfer = newPending(userId, Rail.WITHDRAWAL, currency, amountCents, key, fee);
            transfer.setFromAccountId(wallet.getId());
            if (feeAccount != null) transfer.setFeeAccountId(feeAccount.getId());
            transfers.saveAndFlush(transfer);

            long start = lockedBalance(wallet.getId());
            List<LedgerService.Leg> legs = new ArrayList<>();
            legs.add(new LedgerService.Leg(wallet.getId(), -totalDebit, LedgerEntry.Role.FROM, currency,
                    start - totalDebit));
            // Both shared accounts are advanced in this fixed order, so no two
            // withdrawals can hold them the other way round.
            legs.add(new LedgerService.Leg(provider.getId(), amountCents, LedgerEntry.Role.CASH_OUT, currency,
                    bumpShared(provider.getId(), amountCents)));
            if (fee > 0) {
                legs.add(new LedgerService.Leg(feeAccount.getId(), fee, LedgerEntry.Role.FEE_REVENUE, currency,
                        bumpShared(feeAccount.getId(), fee)));
            }
            ledger.post(transfer.getId(), legs);

            applyProjections(Map.of(wallet.getId(), -totalDebit));

            complete(transfer);

            Instant at = Instant.now();
            notifier.balance(userId, new BalanceNotifier.BalancePush(wallet.getId(), currency,
                    Money.format(start - totalDebit), Money.format(start - totalDebit),
                    at, transfer.getReference(), at));
            notifier.transaction(userId, transactionPush(transfer, Rail.WITHDRAWAL, "OUT", "Cash out"));
            audit.record(AuditService.Action.WITHDRAWAL, AuditLog.Outcome.SUCCESS, userId,
                    transfer.getReference() + " " + currency + " " + Money.format(amountCents));

            return new Result(transfer.getReference(), "COMPLETED", false, Money.format(amountCents),
                    Money.format(fee), currency, at, false, null, Money.format(start - totalDebit),
                    "Cash out", List.of());
        }));
    }

    // ------------------------------------------------------------------- quote

    /**
     * Advisory pre-flight for the amount field. It reads without locking, so it can
     * say "you appear to have room" a moment before a concurrent debit takes it away.
     * That is acceptable here and nowhere else: the authoritative check happens under
     * the lock inside transfer().
     */
    public Quote quote(Long senderId, String toEmail, String currency, long amountCents) {
        User sender = requireUser(senderId);
        requireActive(sender);

        long fee = feeFor(currency, amountCents);
        long total = amountCents + fee;
        String remaining = Money.format(limits.remainingToday(sender.getKycTier(), currency, senderId));

        User recipient = toEmail == null ? null
                : users.findByEmail(toEmail.trim().toLowerCase()).orElse(null);

        if (recipient == null) {
            return blocked(null, fee, total, currency, remaining, "USER_NOT_FOUND");
        }
        if (recipient.getId().equals(senderId)) {
            return blocked(recipient.getFullName(), fee, total, currency, remaining, "SELF_TRANSFER");
        }

        Account from = findWallet(senderId, currency).orElse(null);
        Account to = findWallet(recipient.getId(), currency).orElse(null);
        if (from == null || to == null) {
            return blocked(recipient.getFullName(), fee, total, currency, remaining, "CURRENCY_MISMATCH");
        }

        TierLimit limit = limits.limitsFor(sender.getKycTier());
        if (sender.isWithdrawalsFrozen()) {
            return blocked(recipient.getFullName(), fee, total, currency, remaining, "WITHDRAWALS_FROZEN");
        }
        if (total > from.getBalanceCents()) {
            return blocked(recipient.getFullName(), fee, total, currency, remaining, "INSUFFICIENT_FUNDS");
        }
        LimitService.Spent spent = limits.spent(senderId, currency);
        if (total > limit.getPerTransactionCents()
                || spent.todayCents() + total > limit.getDailyCents()
                || spent.monthCents() + total > limit.getMonthlyCents()) {
            return blocked(recipient.getFullName(), fee, total, currency, remaining, "LIMIT_EXCEEDED");
        }

        return new Quote(recipient.getFullName(), Money.format(fee), Money.format(total),
                Money.format(from.getBalanceCents() - total), Money.format(to.getBalanceCents() + amountCents),
                remaining, true, null);
    }

    private Quote blocked(String name, long fee, long total, String currency,
                          String remaining, String reason) {
        return new Quote(name, Money.format(fee), Money.format(total), null, null, remaining, false, reason);
    }

    // ------------------------------------------------------------------ shared

    private <T> T withDeadlockRetry(java.util.function.Supplier<T> work) {
        for (int attempt = 1; ; attempt++) {
            try {
                return work.get();
            } catch (DataAccessException ex) {
                if (attempt >= MAX_ATTEMPTS || !isDeadlock(ex)) throw ex;
                log.warn("deadlock on attempt {}, retrying", attempt, ex);
                sleepWithJitter(attempt);
            }
        }
    }

    /**
     * Retrying instantly makes a losing thread queue up behind the same winner it just
     * collided with, so contending transfers that lose once tend to lose all three
     * times. A few milliseconds of per-attempt jitter spreads the retries out.
     */
    private void sleepWithJitter(int attempt) {
        long millis = attempt * 15L + RANDOM.nextLong(35L);
        try {
            Thread.sleep(millis);
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            throw ApiException.conflict("TRANSFER_INTERRUPTED", "The transfer was interrupted; retry it once.");
        }
    }

    /**
     * Locks the given accounts in ascending id order, one statement per account. The
     * ordering is enforced here rather than left to the caller, because a single path
     * that locks in the other order reintroduces the circular wait for the whole
     * system — and a set-based query could not honour it anyway, since SQL Server does
     * not tie lock order to ORDER BY.
     */
    private List<Long> lockAccounts(List<Long> ids) {
        List<Long> ordered = ids.stream().distinct().sorted(Comparator.naturalOrder()).toList();
        List<Long> locked = ordered.stream()
                .map(id -> accounts.lockForUpdate(id).orElse(null))
                .filter(java.util.Objects::nonNull)
                .toList();
        if (locked.size() != ordered.size()) {
            throw ApiException.of(HttpStatus.CONFLICT, "ACCOUNT_NOT_FOUND",
                    "A wallet involved in this transfer no longer exists.");
        }
        return locked;
    }

    /**
     * The balance of an account this transaction has just locked. Read off the row, not
     * from the Account entity: the persistence context still holds whatever it loaded
     * before the lock was granted, and a lock that hands back that older number is as
     * wrong as never locking.
     */
    private long lockedBalance(Long accountId) {
        Long cents = accounts.balanceCentsOf(accountId);
        if (cents == null) {
            throw ApiException.of(HttpStatus.CONFLICT, "ACCOUNT_NOT_FOUND",
                    "Wallet " + accountId + " no longer exists.");
        }
        return cents;
    }

    /**
     * Advance one unlocked shared account and return the balance its leg should record.
     *
     * System accounts are deliberately never locked, because every transfer in the
     * system touches the same few of them. That means a leg cannot compute its running
     * balance by reading the account first and adding afterwards: two movements through
     * the same row both read the same starting balance, and the second books a balance
     * that never existed. The atomic increment takes the row's write lock and keeps it
     * until commit, so the balance read back after it is the one this movement produced.
     */
    private long bumpShared(Long accountId, long delta) {
        if (accounts.applyProjection(accountId, delta, Instant.now()) != 1) {
            throw ApiException.of(HttpStatus.CONFLICT, "ACCOUNT_NOT_FOUND",
                    "Wallet " + accountId + " could not be updated.");
        }
        Long after = accounts.balanceCentsOf(accountId);
        if (after == null) {
            throw ApiException.of(HttpStatus.CONFLICT, "ACCOUNT_NOT_FOUND",
                    "Wallet " + accountId + " no longer exists.");
        }
        return after;
    }

    private void applyProjections(Map<Long, Long> deltas) {
        Instant at = Instant.now();
        deltas.forEach((id, delta) -> {
            if (id == 0L || delta == 0L) return;
            int updated = accounts.applyProjection(id, delta, at);
            if (updated != 1) {
                throw ApiException.of(HttpStatus.CONFLICT, "ACCOUNT_NOT_FOUND",
                        "Wallet " + id + " could not be updated.");
            }
        });
    }

    private void complete(Transfer transfer) {
        transfer.setStatus(Transfer.Status.COMPLETED);
        transfer.setCompletedAt(Instant.now());
        transfers.saveAndFlush(transfer);
    }

    private Transfer newPending(Long ownerUserId, Rail rail, String currency, long amountCents,
                               String idempotencyKey, long feeCents) {
        if (amountCents <= 0) {
            throw ApiException.of(HttpStatus.BAD_REQUEST, "INVALID_AMOUNT", "Amount must be greater than zero.");
        }
        if (idempotencyKey == null || idempotencyKey.isBlank() || idempotencyKey.length() > 80) {
            throw ApiException.of(HttpStatus.BAD_REQUEST, "IDEMPOTENCY_KEY_REQUIRED",
                    "A transfer must carry a client-generated idempotency key.");
        }
        Transfer t = new Transfer();
        t.setReference(nextReference());
        t.setOwnerUserId(ownerUserId);
        t.setType(Transfer.Type.valueOf(rail.name()));
        t.setIdempotencyKey(idempotencyKey);
        t.setCurrency(currency);
        t.setAmountCents(amountCents);
        t.setFeeCents(feeCents);
        t.setStatus(Transfer.Status.PENDING);
        return t;
    }

    private String existingIdempotentResult(Long userId, String key) {
        return transfers.findByOwnerUserIdAndIdempotencyKey(userId, key)
                .map(Transfer::getReference)
                .orElse(null);
    }

    /**
     * A retry returns the original transfer rather than performing the work again.
     * Network retries and double taps are therefore harmless by construction, which
     * is the property the unique index on the key exists to make true.
     */
    private Result replayed(String reference, Long userId) {
        Transfer original = transfers.findByReference(reference)
                .orElseThrow(() -> ApiException.of(HttpStatus.CONFLICT, "DUPLICATE_REQUEST",
                        "This request was already seen but its transfer is gone."));
        return new Result(original.getReference(), original.getStatus().name(), true,
                Money.format(original.getAmountCents()), Money.format(original.getFeeCents()),
                original.getCurrency(),
                original.getCompletedAt() == null ? original.getInitiatedAt() : original.getCompletedAt(),
                original.isReviewFlag(), original.getAnomalyScore(),
                Money.format(balanceOfWallet(userId, original)),
                counterpartyName(original, userId), List.of());
    }

    private long balanceOfWallet(Long userId, Transfer original) {
        return findWallet(userId, original.getCurrency())
                .map(a -> accounts.balanceCentsOf(a.getId())).orElse(0L);
    }

    private String counterpartyName(Transfer original, Long viewerId) {
        Long otherAccountId = original.getFromAccountId() != null
                && original.getFromAccountId().equals(walletIdOf(viewerId, original.getCurrency()))
                ? original.getToAccountId() : original.getFromAccountId();
        if (otherAccountId == null) return "Funding provider";
        return accounts.findById(otherAccountId)
                .map(a -> a.getUserId() == null ? a.getLabel()
                        : users.findById(a.getUserId()).map(User::getFullName).orElse(a.getLabel()))
                .orElse("Counterparty");
    }

    private Long walletIdOf(Long userId, String currency) {
        return findWallet(userId, currency).map(Account::getId).orElse(null);
    }

    private User requireUser(Long id) {
        return users.findById(id)
                .orElseThrow(() -> ApiException.notFound("USER_NOT_FOUND", "No customer for this session."));
    }

    private void requireActive(User user) {
        if (user.getStatus() != User.Status.ACTIVE && user.getStatus() != User.Status.PENDING_KYC) {
            throw ApiException.of(HttpStatus.FORBIDDEN, "ACCOUNT_NOT_ACTIVE",
                    "This account is " + user.getStatus() + ".");
        }
    }

    /** Set by reconciliation when a projection cannot be proved; withdrawals wait for review. */
    private void requireNotFrozen(User user) {
        if (user.isWithdrawalsFrozen()) {
            throw ApiException.of(HttpStatus.FORBIDDEN, "WITHDRAWALS_FROZEN",
                    "Outgoing money is paused on this account pending a ledger review.");
        }
    }

    private Account requireWallet(Long userId, String currency) {
        return findWallet(userId, currency)
                .orElseThrow(() -> ApiException.conflict("CURRENCY_MISMATCH",
                        "There is no " + currency + " wallet on this account."));
    }

    private Optional<Account> findWallet(Long userId, String currency) {
        return accounts.findByUserIdAndCurrencyAndKind(userId, currency, Account.Kind.CUSTOMER_WALLET);
    }

    private Account requireSystemAccount(Account.Kind kind, String currency) {
        return accounts.findByKindAndCurrency(kind, currency)
                .orElseThrow(() -> ApiException.of(HttpStatus.INTERNAL_SERVER_ERROR, "SYSTEM_ACCOUNT_MISSING",
                        "The platform account for " + kind + " " + currency + " is missing."));
    }

    private void assertSufficient(Long walletId, long totalDebitCents) {
        long balance = lockedBalance(walletId);
        if (balance < totalDebitCents) {
            throw ApiException.insufficientFunds(totalDebitCents, balance);
        }
    }

    private void assertWithinLimits(User sender, String currency, long totalDebitCents) {
        try {
            limits.assertWithinLimits(sender.getKycTier(), currency, totalDebitCents,
                    limits.spent(sender.getId(), currency));
        } catch (ApiException ex) {
            audit.recordDetached(AuditService.Action.LIMIT_BREACH, AuditLog.Outcome.DENIED, sender.getId(),
                    ex.getCode() + " " + currency + " requested=" + totalDebitCents);
            throw ex;
        }
    }

    private long feeFor(String currency, long amountCents) {
        var fees = props.getFees();
        return Money.fee(amountCents, fees.getBasisPoints(), fees.fixedFor(currency));
    }

    private static AuditService.Action auditAction(Rail rail) {
        return switch (rail) {
            case TRANSFER -> AuditService.Action.TRANSFER;
            case DEPOSIT -> AuditService.Action.DEPOSIT;
            case WITHDRAWAL -> AuditService.Action.WITHDRAWAL;
        };
    }

    private BalanceNotifier.TransactionPush transactionPush(Transfer t, Rail rail, String direction,
                                                            String counterparty) {
        return new BalanceNotifier.TransactionPush(t.getReference(), rail.name(), direction, t.getCurrency(),
                Money.format(t.getAmountCents()), Money.format(t.getFeeCents()), t.getStatus().name(),
                t.getCompletedAt() == null ? Instant.now() : t.getCompletedAt(),
                counterparty, t.isReviewFlag());
    }

    /** Readable, quotable in a dispute, and impossible to guess. */
    private static String nextReference() {
        StringBuilder sb = new StringBuilder("WLT-");
        for (int i = 0; i < 8; i++) {
            sb.append(REFERENCE_ALPHABET.charAt(RANDOM.nextInt(REFERENCE_ALPHABET.length())));
        }
        return sb.toString();
    }

    private static boolean isDeadlock(Throwable ex) {
        for (Throwable t = ex; t != null; t = t.getCause()) {
            if (t instanceof PessimisticLockingFailureException) return true;
            if (t instanceof SQLException sql && sql.getErrorCode() == SQL_DEADLOCK) return true;
            if (t.getMessage() != null && t.getMessage().contains("deadlock")) return true;
            if (t.getCause() == t) break;
        }
        return false;
    }
}
