package com.wallet.service;

import com.wallet.domain.Account;
import com.wallet.domain.AuditLog;
import com.wallet.domain.ReconciliationRun;
import com.wallet.domain.User;
import com.wallet.repository.AccountRepository;
import com.wallet.repository.ReconciliationRunRepository;
import com.wallet.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Nightly proof that the cached balances match the ledger.
 *
 * The projection exists so a home screen does not have to sum millions of rows, and a
 * projection that drifted is worse than no projection at all: it looks exactly like a
 * correct number. So every account is recomputed from its entries on a schedule, the
 * comparison is recorded whether or not it agrees, and disagreement freezes outgoing
 * money for the affected customer until a repair proves agreement.
 *
 * Repairing moves the projection to the ledger, never the other way round. Entries
 * are the source of truth and they are append-only, so a drift can only ever be
 * corrected by changing the derived column.
 */
@Service
public class ReconciliationService {

    private static final Logger log = LoggerFactory.getLogger(ReconciliationService.class);

    public record Summary(int checked, int matched, int drifted, int repaired, List<String> drifts) {}

    private final AccountRepository accounts;
    private final ReconciliationRunRepository runs;
    private final UserRepository users;
    private final AuditService audit;
    private final JdbcTemplate jdbc;

    public ReconciliationService(AccountRepository accounts, ReconciliationRunRepository runs,
                                 UserRepository users, AuditService audit, JdbcTemplate jdbc) {
        this.accounts = accounts;
        this.runs = runs;
        this.users = users;
        this.audit = audit;
        this.jdbc = jdbc;
    }

    @Scheduled(cron = "${wallet.reconciliation.cron:0 30 2 * * *}")
    public void nightlyRun() {
        Summary summary = reconcile(false);
        log.info("reconciliation: {} accounts, {} matched, {} drifted",
                summary.checked(), summary.matched(), summary.drifted());
    }

    @Transactional
    public Summary reconcile(boolean repair) {
        int matched = 0;
        int drifted = 0;
        int repaired = 0;
        List<String> drifts = new ArrayList<>();
        List<Long> usersWithDrift = new ArrayList<>();

        for (Account account : accounts.findAll()) {
            long projected = account.getBalanceCents();
            long ledger = accounts.ledgerBalanceOf(account.getId());

            if (projected == ledger) {
                runs.save(ReconciliationRun.of(account.getId(), projected, ledger,
                        ReconciliationRun.Outcome.MATCHED));
                matched++;
                continue;
            }

            drifted++;
            String detail = "account " + account.getId() + " (" + account.getCurrency() + ") projected="
                    + projected + " ledger=" + ledger + " drift=" + (projected - ledger);
            drifts.add(detail);
            runs.save(ReconciliationRun.of(account.getId(), projected, ledger, ReconciliationRun.Outcome.DRIFT));
            audit.recordDetached(AuditService.Action.RECONCILIATION_DRIFT, AuditLog.Outcome.FAILED,
                    account.getUserId(), detail);

            // Outgoing money stops before it is understood. Deposits and incoming
            // transfers stay open: freezing them would punish the customer twice.
            freezeWithdrawals(account);
            if (account.getUserId() != null) usersWithDrift.add(account.getUserId());

            if (repair) {
                long correction = ledger - projected;
                int updated = accounts.applyProjection(account.getId(), correction, Instant.now());
                if (updated == 1) {
                    runs.save(ReconciliationRun.of(account.getId(), ledger, ledger,
                            ReconciliationRun.Outcome.REPAIRED));
                    repaired++;
                    log.warn("repaired projection for {}: {}", account.getId(), detail);
                }
            }
        }

        if (repaired > 0) {
            jdbc.update("UPDATE app_state SET [value] = ? WHERE [key] = 'ledger_repaired_at'",
                    Instant.now().toString());
        }
        restoreFrozenUsers(usersWithDrift);
        return new Summary(matched + drifted, matched, drifted, repaired, drifts);
    }

    /**
     * A freeze is lifted only by a complete run in which none of that customer's
     * wallets disagreed, so the way out of a freeze is to have correct books. One bad
     * wallet keeps the whole customer frozen.
     */
    private void restoreFrozenUsers(List<Long> usersWithDrift) {
        List<User> frozen = users.findAll().stream().filter(User::isWithdrawalsFrozen).toList();
        for (User user : frozen) {
            if (usersWithDrift.contains(user.getId())) continue;
            user.setWithdrawalsFrozen(false);
            users.save(user);
            log.info("withdrawals restored for user {}", user.getId());
        }
    }

    private void freezeWithdrawals(Account account) {
        if (account.getUserId() == null) return;
        users.findById(account.getUserId()).ifPresent(user -> {
            if (user.isWithdrawalsFrozen()) return;
            user.setWithdrawalsFrozen(true);
            users.save(user);
            log.error("WITHDRAWALS FROZEN for user {} after ledger drift on account {}",
                    user.getId(), account.getId());
        });
    }
}
