package com.wallet.ledger;

import com.wallet.domain.Account;
import com.wallet.domain.User;
import com.wallet.error.ApiException;
import com.wallet.repository.AccountRepository;
import com.wallet.repository.UserRepository;
import com.wallet.service.AuthService;
import com.wallet.service.TransferService;
import com.wallet.support.Money;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * These tests run against a real SQL Server (wallet_test) because every guarantee worth
 * testing here is enforced by the database: the posting guards, the append-only denial,
 * the pessimistic locks, and the unique idempotency index. A mocked repository would
 * prove only that the code agrees with itself.
 */
@SpringBootTest
@ActiveProfiles("test")
class LedgerEngineIT {

    private static final String PASSWORD = "correct horse battery";
    private static final String PIN = "4321";
    private static final String WRONG_PIN = "1111";

    @Autowired AuthService auth;
    @Autowired TransferService transfers;
    @Autowired AccountRepository accounts;
    @Autowired UserRepository users;
    @Autowired JdbcTemplate jdbc;

    private User alice;
    private User bob;

    @BeforeEach
    void onboardTwoCustomers() {
        alice = register("alice", "Alice One");
        bob = register("bob", "Bob Two");
    }

    // ------------------------------------------------------------ conservation

    @Test
    @DisplayName("concurrent transfers, including reciprocal pairs, conserve total money")
    void concurrentTransfersConserveMoney() throws Exception {
        fund(alice, "6000.00");
        fund(bob, "6000.00");
        assertEquals(0L, totalAcrossAllAccounts(), "the whole system must net to zero before the run");

        // Reciprocal A->B and B->A on every thread is the shape that deadlocks a naive
        // implementation: without a deterministic lock order the two transfers each hold
        // one wallet and wait for the other.
        List<Callable<Void>> work = new ArrayList<>();
        for (int i = 0; i < 24; i++) {
            final int n = i;
            work.add(() -> {
                String key = "stress-" + n + "-" + UUID.randomUUID();
                if (n % 2 == 0) {
                    transfers.transfer(alice.getId(), bob.getEmail(), "ETB", Money.toCents("50.00"), PIN, key);
                } else {
                    transfers.transfer(bob.getId(), alice.getEmail(), "ETB", Money.toCents("50.00"), PIN, key);
                }
                return null;
            });
        }

        ExecutorService pool = Executors.newFixedThreadPool(8);
        List<Future<Void>> futures = pool.invokeAll(work);
        pool.shutdown();
        assertTrue(pool.awaitTermination(120, TimeUnit.SECONDS), "the pool did not finish");

        List<String> failures = new ArrayList<>();
        for (Future<Void> f : futures) {
            try {
                f.get();
            } catch (ExecutionException ex) {
                failures.add(String.valueOf(ex.getCause()));
            }
        }
        assertTrue(failures.isEmpty(), "transfers under contention must not fail: " + failures);

        assertEquals(0L, totalAcrossAllAccounts(), "money was neither created nor destroyed");
        assertFalse(anyCustomerWalletIsNegative(), "a wallet was driven below zero");
        assertEveryTransferBalances();
    }

    @Test
    @DisplayName("a random sequence of transfers leaves every transfer summing to zero")
    void randomSequenceKeepsEveryTransferBalanced() {
        fund(alice, "9000.00");
        fund(bob, "9000.00");
        java.util.Random random = new java.util.Random(7);
        String run = UUID.randomUUID().toString();

        for (int i = 0; i < 25; i++) {
            long cents = 100 + random.nextInt(20_000);
            boolean fromAlice = random.nextBoolean();
            transfers.transfer(fromAlice ? alice.getId() : bob.getId(),
                    fromAlice ? bob.getEmail() : alice.getEmail(),
                    "ETB", cents, PIN, run + "-" + i);
            assertEquals(0L, totalAcrossAllAccounts(), "after random transfer " + i);
        }

        assertEveryTransferBalances();
    }

    // ------------------------------------------------------------ idempotency

    @Test
    @DisplayName("replaying a transfer with the same idempotency key has one ledger effect")
    void idempotentReplayHasOneEffect() {
        fund(alice, "1000.00");
        long funded = wallet(alice, "ETB").getBalanceCents();
        String key = "replay-" + UUID.randomUUID();

        TransferService.Result first =
                transfers.transfer(alice.getId(), bob.getEmail(), "ETB", Money.toCents("100.00"), PIN, key);
        long afterFirst = wallet(alice, "ETB").getBalanceCents();
        TransferService.Result second =
                transfers.transfer(alice.getId(), bob.getEmail(), "ETB", Money.toCents("100.00"), PIN, key);

        assertEquals(first.reference(), second.reference(), "a retry must return the original");
        assertTrue(second.replayed());
        assertEquals(afterFirst, wallet(alice, "ETB").getBalanceCents(),
                "a retry must not debit twice");
        assertTrue(afterFirst < funded);

        Integer legs = jdbc.queryForObject(
                "SELECT COUNT(*) FROM ledger_entries e JOIN transfers t ON t.id = e.transfer_id "
                        + "WHERE t.reference = ?", Integer.class, first.reference());
        assertTrue(legs != null && legs >= 2, "the original must have posted its legs");

        Integer rows = jdbc.queryForObject(
                "SELECT COUNT(*) FROM transfers WHERE owner_user_id = ? AND idempotency_key = ?",
                Integer.class, alice.getId(), key);
        assertEquals(1, rows, "a retry must not create a second transfer row");
    }

    // ------------------------------------------------------------- ledger guards

    @Test
    @DisplayName("an unbalanced extra leg on a completed transfer is rejected by the database")
    void unbalancedPostingIsRejected() {
        fund(alice, "500.00");
        Long transferId = jdbc.queryForObject(
                "SELECT TOP 1 id FROM transfers WHERE owner_user_id = ? ORDER BY id DESC",
                Long.class, alice.getId());
        Long walletId = wallet(alice, "ETB").getId();

        DataAccessException rejected = assertThrows(DataAccessException.class, () -> jdbc.update(
                "INSERT INTO ledger_entries (transfer_id, account_id, amount_cents, entry_role, currency, "
                        + "balance_after_cents) VALUES (?, ?, -1, N'FEE', N'ETB', 0)", transferId, walletId));
        assertTrue(isLedgerGuard(rejected), "expected a 500xx guard, got " + root(rejected));
    }

    @Test
    @DisplayName("posted entries cannot be updated or deleted, even by the runtime login")
    void postedEntriesAreAppendOnly() {
        fund(alice, "300.00");

        DataAccessException update = assertThrows(DataAccessException.class,
                () -> jdbc.update("UPDATE ledger_entries SET balance_after_cents = balance_after_cents "
                        + "WHERE account_id = ?", wallet(alice, "ETB").getId()));
        assertTrue(isLedgerGuard(update) || isPermissionDenied(update),
                "UPDATE must be refused: " + root(update));

        DataAccessException delete = assertThrows(DataAccessException.class,
                () -> jdbc.update("DELETE FROM ledger_entries WHERE account_id = ?",
                        wallet(alice, "ETB").getId()));
        assertTrue(isLedgerGuard(delete) || isPermissionDenied(delete),
                "DELETE must be refused: " + root(delete));
    }

    @Test
    @DisplayName("a debit larger than the ledger balance is rejected even as a balanced pair")
    void overdraftIsRejectedAtTheLedger() {
        fund(alice, "100.00");
        Long from = wallet(alice, "ETB").getId();
        Long to = wallet(bob, "ETB").getId();
        long tooBig = 50_000_000L;

        String fraudKey = "fraud-" + UUID.randomUUID();
        String fraudReference = "WLT-F" + fraudKey.substring(6, 14).toUpperCase();
        jdbc.update("INSERT INTO transfers (reference, owner_user_id, type, idempotency_key, currency, "
                        + "amount_cents, fee_cents, status, from_account_id, to_account_id, initiated_at) "
                        + "VALUES (?, ?, N'TRANSFER', ?, N'ETB', ?, 0, N'PENDING', ?, ?, ?)",
                fraudReference, alice.getId(), fraudKey, tooBig, from, to, Instant.now().toString());
        Long transferId = jdbc.queryForObject("SELECT id FROM transfers WHERE idempotency_key = ?",
                Long.class, fraudKey);

        // Both legs in one statement, so zero-sum and the debit-total guard are
        // satisfied: the only thing left to stop this is the overdraft guard.
        DataAccessException rejected = assertThrows(DataAccessException.class, () -> jdbc.update(
                "INSERT INTO ledger_entries (transfer_id, account_id, amount_cents, entry_role, currency, "
                        + "balance_after_cents) VALUES (?, ?, ?, N'FROM', N'ETB', 0), (?, ?, ?, N'TO', N'ETB', 0)",
                transferId, from, -tooBig, transferId, to, tooBig));
        SQLException sql = sqlIn(rejected);
        assertNotNull(sql, "the driver error must be reachable in the cause chain");
        assertEquals(50008, sql.getErrorCode(), "expected the overdraft guard, got " + describe(sql));
    }

    @Test
    @DisplayName("spending more than the balance is refused before any entry is written")
    void insufficientFundsIsRefused() {
        fund(alice, "20.00");

        ApiException ex = assertThrows(ApiException.class, () -> transfers.transfer(
                alice.getId(), bob.getEmail(), "ETB", Money.toCents("500.00"), PIN, "short-" + UUID.randomUUID()));
        assertEquals("INSUFFICIENT_FUNDS", ex.getCode());
        assertEquals(0L, totalAcrossAllAccounts());
    }

    // ------------------------------------------------------------------- security

    @Test
    @DisplayName("five wrong PINs lock the PIN, and the lockout survives the rollback")
    void pinLockoutAfterRepeatedFailures() {
        fund(alice, "500.00");
        String run = "pin-" + UUID.randomUUID();

        ApiException last = null;
        for (int i = 0; i < 5; i++) {
            try {
                transfers.transfer(alice.getId(), bob.getEmail(), "ETB", Money.toCents("10.00"),
                        WRONG_PIN, run + "-" + i);
            } catch (ApiException ex) {
                last = ex;
            }
        }

        assertTrue(last != null && "PIN_LOCKED".equals(last.getCode()),
                "the fifth attempt must lock the PIN, got " + last);

        User locked = users.findById(alice.getId()).orElseThrow();
        assertTrue(locked.getPinLockedUntil() != null && locked.getPinLockedUntil().isAfter(Instant.now()));
        assertEquals(5, locked.getFailedPinAttempts(),
                "the counter must persist even though every money transaction rolled back");
    }

    @Test
    @DisplayName("a locked PIN cannot be used again until the window passes")
    void lockedPinStaysLocked() {
        fund(alice, "500.00");
        String run = "lock-" + UUID.randomUUID();
        for (int i = 0; i < 5; i++) {
            try {
                transfers.transfer(alice.getId(), bob.getEmail(), "ETB", Money.toCents("10.00"),
                        WRONG_PIN, run + "-" + i);
            } catch (ApiException ignored) {
                // Every attempt is a rejection; the last one is the lockout.
            }
        }

        ApiException ex = assertThrows(ApiException.class, () -> transfers.transfer(
                alice.getId(), bob.getEmail(), "ETB", Money.toCents("10.00"), PIN, run + "-correct"));
        assertEquals("PIN_LOCKED", ex.getCode(),
                "the right PIN must not rescue a session from a lockout window");
    }

    @Test
    @DisplayName("the daily ceiling is enforced server-side, not only displayed")
    void dailyLimitIsEnforced() {
        fund(alice, "200000.00");
        String run = "day-" + UUID.randomUUID();
        // Tier 0 allows 5000.00 per transaction and 10000.00 per day; 4000.00 plus the
        // fee each time reaches the daily ceiling on the third movement.
        transfers.transfer(alice.getId(), bob.getEmail(), "ETB", Money.toCents("4000.00"), PIN, run + "-1");
        transfers.transfer(alice.getId(), bob.getEmail(), "ETB", Money.toCents("4000.00"), PIN, run + "-2");

        ApiException ex = assertThrows(ApiException.class, () -> transfers.transfer(
                alice.getId(), bob.getEmail(), "ETB", Money.toCents("4000.00"), PIN, run + "-3"));
        assertEquals("LIMIT_EXCEEDED", ex.getCode());
        assertEquals(0L, totalAcrossAllAccounts());
    }

    // -------------------------------------------------------------------- helpers

    private User register(String localPart, String fullName) {
        String email = localPart + "-" + UUID.randomUUID().toString().substring(0, 8) + "@test.local";
        // Document numbers are digested and unique-indexed per tier, so a run cannot
        // collide with the identity document of the run before it.
        String document = "DOC" + UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        return auth.register(email, fullName, PASSWORD, PIN,
                "NATIONAL_ID", document, "+251900000001", LocalDate.parse("1994-02-03"), "ET").user();
    }

    private void fund(User user, String amount) {
        transfers.deposit(user.getId(), "ETB", Money.toCents(amount), PIN, "fund-" + UUID.randomUUID());
    }

    private Account wallet(User user, String currency) {
        return accounts.findByUserIdAndCurrencyAndKind(user.getId(), currency, Account.Kind.CUSTOMER_WALLET)
                .orElseThrow();
    }

    /**
     * The strongest single statement the ledger has to satisfy: summing every account's
     * projection, including the platform's own, must be zero, because every entry has an
     * equal and opposite partner and nothing enters or leaves the system.
     */
    private long totalAcrossAllAccounts() {
        Long total = jdbc.queryForObject("SELECT COALESCE(SUM(balance_cents), 0) FROM accounts", Long.class);
        return total == null ? 0L : total;
    }

    private boolean anyCustomerWalletIsNegative() {
        Integer negatives = jdbc.queryForObject(
                "SELECT COUNT(*) FROM accounts WHERE kind = N'CUSTOMER_WALLET' AND balance_cents < 0",
                Integer.class);
        return negatives != null && negatives > 0;
    }

    private void assertEveryTransferBalances() {
        Integer unbalanced = jdbc.queryForObject(
                "SELECT COUNT(*) FROM (SELECT transfer_id FROM ledger_entries GROUP BY transfer_id "
                        + "HAVING SUM(amount_cents) <> 0) bad", Integer.class);
        assertEquals(0, unbalanced, "every transfer's entries must sum to zero");

        Integer lonely = jdbc.queryForObject(
                "SELECT COUNT(*) FROM (SELECT transfer_id FROM ledger_entries GROUP BY transfer_id "
                        + "HAVING COUNT(*) < 2) bad", Integer.class);
        assertEquals(0, lonely, "a single leg is not a transfer");
    }

    private static SQLException sqlIn(Throwable ex) {
        for (Throwable t = ex; t != null; t = t.getCause()) {
            if (t instanceof SQLException sql) return sql;
            if (t.getCause() == t) break;
        }
        return null;
    }

    private static boolean isLedgerGuard(Throwable ex) {
        for (Throwable t = ex; t != null; t = t.getCause()) {
            if (t instanceof SQLException sql && sql.getErrorCode() >= 50001 && sql.getErrorCode() <= 50099) {
                return true;
            }
        }
        return false;
    }

    /** 221/229/230/300: the runtime login has no grant for the statement at all. */
    private static boolean isPermissionDenied(Throwable ex) {
        for (Throwable t = ex; t != null; t = t.getCause()) {
            if (t instanceof SQLException sql
                    && (sql.getErrorCode() == 221 || sql.getErrorCode() == 229
                            || sql.getErrorCode() == 230 || sql.getErrorCode() == 300)) {
                return true;
            }
            String message = t.getMessage();
            if (message != null && message.toLowerCase().contains("permission was denied")) return true;
        }
        return false;
    }

    private static String describe(SQLException ex) {
        return "code " + ex.getErrorCode() + ": " + ex.getMessage();
    }

    private static String root(Throwable ex) {
        Throwable t = ex;
        while (t.getCause() != null && t.getCause() != t) t = t.getCause();
        return t.getClass().getSimpleName() + ": " + t.getMessage();
    }
}
