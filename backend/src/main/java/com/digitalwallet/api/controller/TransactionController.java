package com.digitalwallet.api.controller;

import com.digitalwallet.api.dto.request.TransferRequest;
import com.digitalwallet.api.dto.response.ApiResponse;
import com.digitalwallet.api.dto.response.TransactionResponse;
import com.digitalwallet.api.entity.Transaction;
import com.digitalwallet.api.security.UserPrincipal;
import com.digitalwallet.api.service.TransactionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;

/**
 * REST controller for transaction operations including transfers and history.
 */
@RestController
@RequestMapping("/transactions")
@RequiredArgsConstructor
public class TransactionController {

    private final TransactionService transactionService;

    /**
     * POST /api/transactions/transfer
     * Executes a peer-to-peer wallet transfer.
     */
    @PostMapping("/transfer")
    public ResponseEntity<ApiResponse<TransactionResponse>> transfer(
        @AuthenticationPrincipal UserPrincipal principal,
        @Valid @RequestBody TransferRequest request
    ) {
        TransactionResponse response = transactionService.transfer(principal.getId(), request);
        return ResponseEntity.ok(ApiResponse.success("Transfer completed successfully", response));
    }

    /**
     * GET /api/transactions
     * Retrieves paginated transaction history with optional filters.
     */
    @GetMapping
    public ResponseEntity<ApiResponse<Page<TransactionResponse>>> getHistory(
        @AuthenticationPrincipal UserPrincipal principal,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime startDate,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime endDate,
        @RequestParam(required = false) Transaction.TransactionType type,
        @RequestParam(required = false) Transaction.TransactionStatus status,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<TransactionResponse> transactions = transactionService.getTransactionHistory(
            principal.getId(), startDate, endDate, type, status, pageable
        );
        return ResponseEntity.ok(ApiResponse.success(transactions));
    }

    /**
     * GET /api/transactions/{referenceNumber}
     * Retrieves a single transaction by its reference number.
     */
    @GetMapping("/{referenceNumber}")
    public ResponseEntity<ApiResponse<TransactionResponse>> getTransaction(
        @AuthenticationPrincipal UserPrincipal principal,
        @PathVariable String referenceNumber
    ) {
        TransactionResponse response = transactionService.getTransactionByReference(
            principal.getId(), referenceNumber
        );
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
