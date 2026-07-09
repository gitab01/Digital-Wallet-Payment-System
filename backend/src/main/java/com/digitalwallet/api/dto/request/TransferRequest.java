package com.digitalwallet.api.dto.request;

import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;

/**
 * Request payload for peer-to-peer wallet transfer.
 */
@Data
public class TransferRequest {

    @NotBlank(message = "Source wallet number is required")
    private String sourceWalletNumber;

    @NotBlank(message = "Destination wallet number is required")
    private String destinationWalletNumber;

    @NotNull(message = "Amount is required")
    @DecimalMin(value = "0.01", message = "Amount must be greater than 0")
    @Digits(integer = 15, fraction = 4, message = "Invalid amount format")
    private BigDecimal amount;

    @Size(max = 500, message = "Description cannot exceed 500 characters")
    private String description;
}
