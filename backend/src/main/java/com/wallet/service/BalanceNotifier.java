package com.wallet.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Instant;

/**
 * Pushes balances to connected clients.
 *
 * Publishing is deferred to an afterCommit synchronisation, never done inline after
 * the service call. A client that learned about a balance before the transaction
 * decided would see money appear for a transfer that then rolled back — the precise
 * failure that makes a realtime payments UI untrustworthy.
 *
 * Outside a transaction it publishes immediately, so scheduled reconciliation runs
 * still reach clients.
 */
@Service
public class BalanceNotifier {

    private static final Logger log = LoggerFactory.getLogger(BalanceNotifier.class);

    public record BalancePush(Long accountId, String currency, String balance, String available,
                              Instant verifiedAt, String reference, Instant occurredAt) {}

    public record TransactionPush(String reference, String type, String direction, String currency,
                                  String amount, String fee, String status, Instant occurredAt,
                                  String counterparty, boolean reviewFlag) {}

    private final SimpMessagingTemplate messaging;

    public BalanceNotifier(SimpMessagingTemplate messaging) {
        this.messaging = messaging;
    }

    public void balance(Long userId, BalancePush push) {
        publishAfterCommit(userId, "/queue/balances", push);
    }

    public void transaction(Long userId, TransactionPush push) {
        publishAfterCommit(userId, "/queue/transactions", push);
    }

    private void publishAfterCommit(Long userId, String destination, Object payload) {
        if (userId == null) return;

        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    send(userId, destination, payload);
                }
            });
        } else {
            send(userId, destination, payload);
        }
    }

    private void send(Long userId, String destination, Object payload) {
        try {
            // Per-user queue, addressed by the authenticated subject. There is no
            // topic a customer can subscribe to in order to watch someone else move
            // money, and no broadcast of amounts at any point.
            messaging.convertAndSendToUser(String.valueOf(userId), destination, payload);
        } catch (Exception ex) {
            // The transfer is already committed. A failed push costs the client a
            // stale number until they refresh; it must never look like a failed payment.
            log.warn("balance push to user {} failed: {}", userId, ex.toString());
        }
    }
}
