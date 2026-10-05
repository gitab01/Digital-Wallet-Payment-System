package com.wallet.web;

import com.wallet.domain.KycRecord;
import com.wallet.domain.User;
import com.wallet.error.ApiException;
import com.wallet.security.SecurityUser;
import com.wallet.service.AuthService;
import com.wallet.service.KycService;
import com.wallet.service.WalletQueryService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api")
public class KycController {

    private final KycService kyc;
    private final AuthService auth;
    private final WalletQueryService queries;

    public KycController(KycService kyc, AuthService auth, WalletQueryService queries) {
        this.kyc = kyc;
        this.auth = auth;
        this.queries = queries;
    }

    @GetMapping("/kyc")
    public Responses.KycView overview() {
        Long userId = SecurityUser.requiredId();
        User user = auth.require(userId);
        List<KycService.Submission> documents = kyc.history(userId);
        KycService.Submission latest = documents.isEmpty() ? null : documents.get(0);

        return new Responses.KycView(user.getKycTier(),
                latest == null ? "NOT_SUBMITTED" : latest.status().name(),
                latest == null ? null : latest.submittedAt(),
                latest == null ? null : latest.reviewedAt(),
                documents,
                queries.limitView(user, DEFAULT_CURRENCY),
                Math.min(user.getKycTier() + 1, 3));
    }

    @PostMapping("/kyc")
    public ResponseEntity<Responses.KycView> submit(@Valid @RequestBody Requests.KycRequest body) {
        Long userId = SecurityUser.requiredId();
        kyc.submitUpgrade(userId, body.documentType(), body.documentNumber(), body.phone(),
                date(body.dateOfBirth()), body.country());
        return ResponseEntity.status(HttpStatus.CREATED).body(overview());
    }

    /**
     * Reviewer-only. Approval is the only route to a higher tier: there is no endpoint
     * that sets a tier directly, so the ceilings a customer lives under always trace
     * back to a decision somebody holding ROLE_REVIEWER made, and to the audit row
     * recording it.
     */
    @PostMapping("/kyc/{id}/decision")
    public KycService.Submission decide(@PathVariable Long id,
                                        @Valid @RequestBody Requests.DecisionRequest body) {
        return kyc.decide(id, body.approve(), SecurityUser.principal().email());
    }

    private static final String DEFAULT_CURRENCY = "ETB";

    private static LocalDate date(String value) {
        return value == null || value.isBlank() ? null : LocalDate.parse(value);
    }
}
