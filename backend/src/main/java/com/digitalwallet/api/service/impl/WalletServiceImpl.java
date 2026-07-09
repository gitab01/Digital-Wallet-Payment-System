package com.digitalwallet.api.service.impl;

import com.digitalwallet.api.dto.request.CreateWalletRequest;
import com.digitalwallet.api.dto.request.DepositRequest;
import com.digitalwallet.api.dto.response.WalletResponse;
import com.digitalwallet.api.entity.Transaction;
import com.digitalwallet.api.entity.User;
import com.digitalwallet.api.entity.Wallet;
import com.digitalwallet.api.exception.BusinessRuleException;
import com.digitalwallet.api.exception.ResourceNotFoundException;
import com.digitalwallet.api.repository.TransactionRepository;
import com.digitalwallet.api.repository.UserRepository;
import com.digitalwallet.api.repository.WalletRepository;
import com.digitalwallet.api.service.WalletService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Random;
import java.util.stream.Collectors;

/**
 * Implements wallet management operations including creation, deposits, and balance queries.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class WalletServiceImpl implements WalletService {

    private final WalletRepository walletRepository;
    private final UserRepository userRepository;
    private final TransactionRepository transactionRepository;

    @Override
    @Transactional
    public WalletResponse createWallet(Long userId, CreateWalletRequest request) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new ResourceNotFoundException("User not found with ID: " + userId));

        String currencyCode = request.getCurrencyCode().toUpperCase();

        // Prevent duplicate currency wallets per user
        walletRepository.findByUserIdAndCurrencyCode(userId, currencyCode)
            .ifPresent(w -> {
                throw new BusinessRuleException(
                    "A " + currencyCode + " wallet already exists for this account");
            });

        // If setting as default, unset the current default
        if (Boolean.TRUE.equals(request.getSetAsDefault())) {
            walletRepository.findByUserIdAndIsDefaultTrue(userId)
                .ifPresent(existing -> {
                    existing.setIsDefault(false);
                    walletRepository.save(existing);
                });
        }

        Wallet wallet = Wallet.builder()
            .walletNumber(generateWalletNumber())
            .user(user)
            .currencyCode(currencyCode)
            .balance(BigDecimal.ZERO)
            .availableBalance(BigDecimal.ZERO)
            .isDefault(Boolean.TRUE.equals(request.getSetAsDefault()))
            .build();

        Wallet savedWallet = walletRepository.save(wallet);
        log.info("Created {} wallet {} for user {}", currencyCode, savedWallet.getWalletNumber(), userId);

        return mapToResponse(savedWallet);
    }

    @Override
    @Transactional(readOnly = true)
    public List<WalletResponse> getUserWallets(Long userId) {
        return walletRepository.findByUserId(userId)
            .stream()
            .map(this::mapToResponse)
            .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public WalletResponse getWalletByNumber(Long userId, String walletNumber) {
        Wallet wallet = walletRepository.findByWalletNumber(walletNumber)
            .orElseThrow(() -> new ResourceNotFoundException("Wallet not found: " + walletNumber));

        if (!wallet.getUser().getId().equals(userId)) {
            throw new BusinessRuleException("Wallet does not belong to the authenticated user");
        }

        return mapToResponse(wallet);
    }

    @Override
    @Transactional
    public WalletResponse deposit(Long userId, DepositRequest request) {
        Wallet wallet = walletRepository.findByIdWithLock(
                walletRepository.findByWalletNumber(request.getWalletNumber())
                    .orElseThrow(() -> new ResourceNotFoundException(
                        "Wallet not found: " + request.getWalletNumber()))
                    .getId()
            ).orElseThrow(() -> new ResourceNotFoundException("Wallet not found"));

        if (!wallet.getUser().getId().equals(userId)) {
            throw new BusinessRuleException("Wallet does not belong to the authenticated user");
        }

        if (wallet.getStatus() != Wallet.WalletStatus.ACTIVE) {
            throw new BusinessRuleException("Cannot deposit to a " + wallet.getStatus() + " wallet");
        }

        wallet.setBalance(wallet.getBalance().add(request.getAmount()));
        wallet.setAvailableBalance(wallet.getAvailableBalance().add(request.getAmount()));
        walletRepository.save(wallet);

        // Record the deposit transaction
        Transaction transaction = Transaction.builder()
            .referenceNumber(generateReference())
            .destinationWallet(wallet)
            .amount(request.getAmount())
            .sourceCurrencyCode(wallet.getCurrencyCode())
            .destinationCurrencyCode(wallet.getCurrencyCode())
            .type(Transaction.TransactionType.DEPOSIT)
            .status(Transaction.TransactionStatus.COMPLETED)
            .description(request.getDescription() != null ? request.getDescription() : "Wallet deposit")
            .completedAt(LocalDateTime.now())
            .build();

        transactionRepository.save(transaction);
        log.info("Deposited {} {} to wallet {}", request.getAmount(), wallet.getCurrencyCode(), wallet.getWalletNumber());

        return mapToResponse(wallet);
    }

    @Override
    public String generateWalletNumber() {
        String number;
        do {
            number = "WLT" + String.format("%013d", (long) (Math.random() * 9_999_999_999_999L));
        } while (walletRepository.existsByWalletNumber(number));
        return number;
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private String generateReference() {
        return "DEP" + System.currentTimeMillis() + new Random().nextInt(1000);
    }

    private WalletResponse mapToResponse(Wallet wallet) {
        return WalletResponse.builder()
            .id(wallet.getId())
            .walletNumber(wallet.getWalletNumber())
            .currencyCode(wallet.getCurrencyCode())
            .balance(wallet.getBalance())
            .availableBalance(wallet.getAvailableBalance())
            .status(wallet.getStatus())
            .isDefault(wallet.getIsDefault())
            .createdAt(wallet.getCreatedAt())
            .build();
    }
}
