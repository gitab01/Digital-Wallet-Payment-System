package com.digitalwallet.api.service;

import com.digitalwallet.api.dto.request.CreateWalletRequest;
import com.digitalwallet.api.dto.request.DepositRequest;
import com.digitalwallet.api.dto.response.WalletResponse;

import java.util.List;

/**
 * Defines wallet management operations.
 */
public interface WalletService {

    /**
     * Creates a new wallet for the authenticated user.
     */
    WalletResponse createWallet(Long userId, CreateWalletRequest request);

    /**
     * Retrieves all wallets belonging to the authenticated user.
     */
    List<WalletResponse> getUserWallets(Long userId);

    /**
     * Retrieves a specific wallet by its wallet number.
     */
    WalletResponse getWalletByNumber(Long userId, String walletNumber);

    /**
     * Credits funds to a wallet (deposit).
     */
    WalletResponse deposit(Long userId, DepositRequest request);

    /**
     * Generates a unique wallet number.
     */
    String generateWalletNumber();
}
