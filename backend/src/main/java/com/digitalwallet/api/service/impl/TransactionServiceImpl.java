package com.digitalwallet.api.service.impl;

import com.digitalwallet.api.dto.request.TransferRequest;
import com.digitalwallet.api.dto.response.TransactionResponse;
import com.digitalwallet.api.entity.Transaction;
import com.digitalwallet.api.entity.Wallet;
import com.digitalwallet.api.exception.BusinessRuleException;
import com.digitalwallet.api.exception.InsufficientFundsException;
import com.digitalwallet.api.exception.ResourceNotFoundException;
import com.digitalwallet.api.repository.TransactionRepository;
import com.digitalwallet.api.repository.WalletRepository;
import com.digitalwallet.api.service.TransactionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Random;

/**
 * Implements financial transaction operations with ACID guarantees.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TransactionServiceImpl implements TransactionService {

    private final TransactionRepository transactionRepository;
    private final WalletRepository walletRepository;

    @Override
    @Transactional
    public TransactionResponse transfer(Long userId, TransferRequest request) {
        if (request.getSourceWalletNumber().equals(request.getDestinationWalletNumber())) {
            throw new BusinessRuleException("Source and destination wallets cannot be the same");
        }

        // Acquire pessimistic locks to prevent concurrent balance issues
        Wallet source = walletRepository.findByIdWithLock(
                walletRepository.findByWalletNumber(request.getSourceWalletNumber())
                    .orElseThrow(() -> new ResourceNotFoundException(
                        "Source wallet not found: " + request.getSourceWalletNumber()))
                    .getId()
            ).orElseThrow(() -> new ResourceNotFoundException("Source wallet not found"));

        Wallet destination = walletRepository.findByIdWithLock(
                walletRepository.findByWalletNumber(request.getDestinationWalletNumber())
                    .orElseThrow(() -> new ResourceNotFoundException(
                        "Destination wallet not found: " + request.getDestinationWalletNumber()))
                    .getId()
            ).orElseThrow(() -> new ResourceNotFoundException("Destination wallet not found"));

        // Authorization check
        if (!source.getUser().getId().equals(userId)) {
            throw new BusinessRuleException("You are not authorized to transfer from this wallet");
        }

        // Wallet status checks
        if (source.getStatus() != Wallet.WalletStatus.ACTIVE) {
            throw new BusinessRuleException("Source wallet is not active");
        }
        if (destination.getStatus() != Wallet.WalletStatus.ACTIVE) {
            throw new BusinessRuleException("Destination wallet is not active");
        }

        // Sufficient funds check
        if (source.getAvailableBalance().compareTo(request.getAmount()) < 0) {
            throw new InsufficientFundsException(
                "Insufficient funds. Available: " + source.getAvailableBalance() +
                " " + source.getCurrencyCode());
        }

        // Calculate fee (0.5% for cross-currency, 0% for same currency)
        boolean crossCurrency = !source.getCurrencyCode().equals(destination.getCurrencyCode());
        BigDecimal fee = crossCurrency
            ? request.getAmount().multiply(new BigDecimal("0.005"))
            : BigDecimal.ZERO;

        BigDecimal totalDebit = request.getAmount().add(fee);

        // Debit source
        source.setBalance(source.getBalance().subtract(totalDebit));
        source.setAvailableBalance(source.getAvailableBalance().subtract(totalDebit));

        // Credit destination (same currency; exchange rate logic can be extended here)
        destination.setBalance(destination.getBalance().add(request.getAmount()));
        destination.setAvailableBalance(destination.getAvailableBalance().add(request.getAmount()));

        walletRepository.save(source);
        walletRepository.save(destination);

        Transaction transaction = Transaction.builder()
            .referenceNumber(generateReference())
            .sourceWallet(source)
            .destinationWallet(destination)
            .amount(request.getAmount())
            .fee(fee)
            .exchangeRate(BigDecimal.ONE)
            .sourceCurrencyCode(source.getCurrencyCode())
            .destinationCurrencyCode(destination.getCurrencyCode())
            .type(Transaction.TransactionType.TRANSFER)
            .status(Transaction.TransactionStatus.COMPLETED)
            .description(request.getDescription())
            .completedAt(LocalDateTime.now())
            .build();

        Transaction saved = transactionRepository.save(transaction);
        log.info("Transfer {} {} from {} to {} completed", request.getAmount(),
            source.getCurrencyCode(), source.getWalletNumber(), destination.getWalletNumber());

        return mapToResponse(saved);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<TransactionResponse> getTransactionHistory(
        Long userId,
        LocalDateTime startDate,
        LocalDateTime endDate,
        Transaction.TransactionType type,
        Transaction.TransactionStatus status,
        Pageable pageable
    ) {
        return transactionRepository
            .findByUserIdWithFilters(userId, startDate, endDate, type, status, pageable)
            .map(this::mapToResponse);
    }

    @Override
    @Transactional(readOnly = true)
    public TransactionResponse getTransactionByReference(Long userId, String referenceNumber) {
        Transaction transaction = transactionRepository.findByReferenceNumber(referenceNumber)
            .orElseThrow(() -> new ResourceNotFoundException(
                "Transaction not found: " + referenceNumber));

        // Ensure the transaction belongs to the requesting user
        boolean isOwner =
            (transaction.getSourceWallet() != null &&
             transaction.getSourceWallet().getUser().getId().equals(userId)) ||
            (transaction.getDestinationWallet() != null &&
             transaction.getDestinationWallet().getUser().getId().equals(userId));

        if (!isOwner) {
            throw new BusinessRuleException("You are not authorized to view this transaction");
        }

        return mapToResponse(transaction);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private String generateReference() {
        return "TXN" + System.currentTimeMillis() + new Random().nextInt(10000);
    }

    private TransactionResponse mapToResponse(Transaction t) {
        return TransactionResponse.builder()
            .id(t.getId())
            .referenceNumber(t.getReferenceNumber())
            .sourceWalletNumber(t.getSourceWallet() != null ? t.getSourceWallet().getWalletNumber() : null)
            .destinationWalletNumber(t.getDestinationWallet() != null ? t.getDestinationWallet().getWalletNumber() : null)
            .amount(t.getAmount())
            .fee(t.getFee())
            .exchangeRate(t.getExchangeRate())
            .sourceCurrencyCode(t.getSourceCurrencyCode())
            .destinationCurrencyCode(t.getDestinationCurrencyCode())
            .type(t.getType())
            .status(t.getStatus())
            .description(t.getDescription())
            .completedAt(t.getCompletedAt())
            .createdAt(t.getCreatedAt())
            .build();
    }
}
