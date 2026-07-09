package com.digitalwallet.api.service;

import com.digitalwallet.api.dto.request.TransferRequest;
import com.digitalwallet.api.dto.response.TransactionResponse;
import com.digitalwallet.api.entity.Transaction;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.time.LocalDateTime;

/**
 * Defines transaction operations including transfers and history retrieval.
 */
public interface TransactionService {

    /**
     * Executes a peer-to-peer transfer between two wallets.
     *
     * @param userId  the ID of the initiating user
     * @param request transfer details
     * @return completed transaction record
     */
    TransactionResponse transfer(Long userId, TransferRequest request);

    /**
     * Retrieves a paginated transaction history for the authenticated user.
     *
     * @param userId    the ID of the user
     * @param startDate optional start date filter
     * @param endDate   optional end date filter
     * @param type      optional transaction type filter
     * @param status    optional transaction status filter
     * @param pageable  pagination parameters
     * @return paginated list of transactions
     */
    Page<TransactionResponse> getTransactionHistory(
        Long userId,
        LocalDateTime startDate,
        LocalDateTime endDate,
        Transaction.TransactionType type,
        Transaction.TransactionStatus status,
        Pageable pageable
    );

    /**
     * Retrieves a single transaction by its reference number.
     */
    TransactionResponse getTransactionByReference(Long userId, String referenceNumber);
}
