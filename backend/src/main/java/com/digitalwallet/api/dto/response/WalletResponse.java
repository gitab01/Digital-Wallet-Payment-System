package com.digitalwallet.api.dto.response;

import com.digitalwallet.api.entity.Wallet;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Response payload representing wallet information.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WalletResponse {

    private Long id;
    private String walletNumber;
    private String currencyCode;
    private BigDecimal balance;
    private BigDecimal availableBalance;
    private Wallet.WalletStatus status;
    private Boolean isDefault;
    private LocalDateTime createdAt;
}
