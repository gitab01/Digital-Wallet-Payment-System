package com.wallet.repository;

import com.wallet.domain.Account;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface AccountRepository extends JpaRepository<Account, Long> {

    List<Account> findByUserIdAndKindOrderByCurrencyAsc(Long userId, Account.Kind kind);

    /** One read for a whole page of clients, grouped by owner in the caller. */
    List<Account> findByUserIdInAndKindOrderByUserIdAscCurrencyAsc(List<Long> userIds, Account.Kind kind);

    Optional<Account> findByUserIdAndCurrencyAndKind(Long userId, String currency, Account.Kind kind);

    Optional<Account> findByKindAndCurrency(Account.Kind kind, String currency);

    /**
     * The serialisation point for every money movement, for one account at a time.
     *
     * UPDLOCK makes the reader take an update lock rather than a shared one, so two
     * concurrent transfers on the same account cannot both read-then-write; ROWLOCK
     * stops SQL Server escalating to a table lock and stalling the whole system.
     *
     * This statement locks a single row on purpose. Ordering a set-based "WHERE id IN
     * (...) ORDER BY id" does not control lock acquisition order — the optimiser is
     * free to take the rows in whatever order the index it chose returns them and sort
     * afterwards — so the ascending-id discipline can only be guaranteed by the caller
     * issuing one statement per id, smallest first.
     *
     * It returns the id and not the account: an entity result would be satisfied from
     * the persistence context, which often already holds this row from an earlier
     * unlocked lookup, and the caller would get the balance as it was before the lock
     * was granted. Lock here, then read the money with balanceCentsOf.
     */
    @Query(value = """
            SELECT id FROM accounts WITH (UPDLOCK, ROWLOCK)
            WHERE id = :id
            """, nativeQuery = true)
    Optional<Long> lockForUpdate(@Param("id") Long id);

    /**
     * Maintains the projection with one atomic statement rather than a read-modify-
     * write through the entity. System accounts are touched by every concurrent
     * transfer, and a version-checked entity update would collide on them for no
     * reason; the database can do the addition itself.
     */
    @Modifying
    @Query(value = """
            UPDATE accounts
               SET balance_cents = balance_cents + :delta,
                   version = version + 1,
                   projection_at = :at
             WHERE id = :id
            """, nativeQuery = true)
    int applyProjection(@Param("id") Long id,
                        @Param("delta") long delta,
                        @Param("at") java.time.Instant at);

    /**
     * The balance straight off the row. This has to be a scalar native query and not
     * findById: after applyProjection the persistence context still holds the pre-update
     * entity, so an entity read would return the balance from before the increment.
     */
    @Query(value = "SELECT balance_cents FROM accounts WHERE id = :id", nativeQuery = true)
    Long balanceCentsOf(@Param("id") Long id);

    /** Reconciliation: the ledger's own verdict on what an account is worth. */
    @Query(value = """
            SELECT COALESCE(SUM(amount_cents), 0) FROM ledger_entries WHERE account_id = :accountId
            """, nativeQuery = true)
    long ledgerBalanceOf(@Param("accountId") Long accountId);
}
