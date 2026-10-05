package com.wallet.web;

import com.wallet.security.SecurityUser;
import com.wallet.service.AuthService;
import com.wallet.service.PinService;
import com.wallet.service.WalletQueryService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/me")
public class MeController {

    private final AuthService auth;
    private final PinService pins;
    private final WalletQueryService queries;

    public MeController(AuthService auth, PinService pins, WalletQueryService queries) {
        this.auth = auth;
        this.pins = pins;
        this.queries = queries;
    }

    @GetMapping
    public Responses.UserView profile() {
        return Responses.user(auth.require(SecurityUser.requiredId()));
    }

    @PostMapping("/pin")
    public ResponseEntity<Void> changePin(@Valid @RequestBody Requests.ChangePinRequest body) {
        pins.changePin(auth.require(SecurityUser.requiredId()), body.currentPin(), body.newPin());
        return ResponseEntity.noContent().build();
    }

    /**
     * What this account can see about itself: sign-ins, denied PIN attempts, limit
     * breaches. A customer who can read this trail is a customer who can tell you
     * about a stolen session before you find out from the ledger.
     */
    @GetMapping("/audit")
    public Responses.PageView<Responses.AuditRow> audit(@RequestParam(defaultValue = "50") int size) {
        List<Responses.AuditRow> items = queries.recentAudit(SecurityUser.requiredId(), size).stream()
                .map(Responses::audit)
                .toList();
        return new Responses.PageView<>(items, items.size(), 0, size);
    }
}
