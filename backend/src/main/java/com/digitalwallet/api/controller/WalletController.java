package com.digitalwallet.api.controller;

import com.digitalwallet.api.dto.request.CreateWalletRequest;
import com.digitalwallet.api.dto.request.DepositRequest;
import com.digitalwallet.api.dto.response.ApiResponse;
import com.digitalwallet.api.dto.response.WalletResponse;
import com.digitalwallet.api.security.UserPrincipal;
import com.digitalwallet.api.service.WalletService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * REST controller for wallet management operations.
 */
@RestController
@RequestMapping("/wallets")
@RequiredArgsConstructor
public class WalletController {

    private final WalletService walletService;

    /**
     * POST /api/wallets
     * Creates a new wallet for the authenticated user.
     */
    @PostMapping
    public ResponseEntity<ApiResponse<WalletResponse>> createWallet(
        @AuthenticationPrincipal UserPrincipal principal,
        @Valid @RequestBody CreateWalletRequest request
    ) {
        WalletResponse response = walletService.createWallet(principal.getId(), request);
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(ApiResponse.success("Wallet created successfully", response));
    }

    /**
     * GET /api/wallets
     * Retrieves all wallets for the authenticated user.
     */
    @GetMapping
    public ResponseEntity<ApiResponse<List<WalletResponse>>> getUserWallets(
        @AuthenticationPrincipal UserPrincipal principal
    ) {
        List<WalletResponse> wallets = walletService.getUserWallets(principal.getId());
        return ResponseEntity.ok(ApiResponse.success(wallets));
    }

    /**
     * GET /api/wallets/{walletNumber}
     * Retrieves a specific wallet by its number.
     */
    @GetMapping("/{walletNumber}")
    public ResponseEntity<ApiResponse<WalletResponse>> getWallet(
        @AuthenticationPrincipal UserPrincipal principal,
        @PathVariable String walletNumber
    ) {
        WalletResponse response = walletService.getWalletByNumber(principal.getId(), walletNumber);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    /**
     * POST /api/wallets/deposit
     * Deposits funds into a wallet.
     */
    @PostMapping("/deposit")
    public ResponseEntity<ApiResponse<WalletResponse>> deposit(
        @AuthenticationPrincipal UserPrincipal principal,
        @Valid @RequestBody DepositRequest request
    ) {
        WalletResponse response = walletService.deposit(principal.getId(), request);
        return ResponseEntity.ok(ApiResponse.success("Deposit successful", response));
    }
}
