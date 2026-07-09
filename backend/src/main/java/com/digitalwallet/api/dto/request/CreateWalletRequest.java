package com.digitalwallet.api.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Request payload for creating a new wallet.
 */
@Data
public class CreateWalletRequest {

    @NotBlank(message = "Currency code is required")
    @Size(min = 3, max = 3, message = "Currency code must be exactly 3 characters (ISO 4217)")
    private String currencyCode;

    private Boolean setAsDefault = false;
}
