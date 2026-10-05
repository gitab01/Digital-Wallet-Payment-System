package com.wallet.web;

import com.wallet.security.SecurityUser;
import com.wallet.service.WalletQueryService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class WalletController {

    private final WalletQueryService wallet;

    public WalletController(WalletQueryService wallet) {
        this.wallet = wallet;
    }

    @GetMapping("/wallet")
    public WalletQueryService.WalletView wallet() {
        return wallet.wallet(SecurityUser.requiredId());
    }

    @PostMapping("/accounts")
    public ResponseEntity<WalletQueryService.AccountView> openAccount(
            @Valid @RequestBody Requests.OpenAccountRequest body) {
        WalletQueryService.AccountView opened =
                wallet.openAccount(SecurityUser.requiredId(), body.currency());
        return ResponseEntity.status(HttpStatus.CREATED).body(opened);
    }
}
