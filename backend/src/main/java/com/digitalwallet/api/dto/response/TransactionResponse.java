package com.digitalwallet.api.dto.response;

import com.digitalwallet.api.entity.Transaction;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Response payload representing a transaction record.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TransactionResponse {

    private Long id;
    private String referenceNumber;
    private String sourceWalletNumber;
    private String destinationWalletNumber;
    private BigDecimal amount;
    private BigDecimal fee;
    private BigDecimal exchangeRate;
    private String sourceCurrencyCode;
    private String destinationCurrencyCode;
    private Transaction.TransactionType type;
    private Transaction.TransactionStatus status;
    private String description;
    private LocalDateTime completedAt;
    private LocalDateTime createdAt;
}
