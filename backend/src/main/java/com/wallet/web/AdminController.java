package com.wallet.web;

import com.wallet.domain.KycRecord;
import com.wallet.domain.User;
import com.wallet.repository.KycRecordRepository;
import com.wallet.service.AuthService;
import com.wallet.service.ReconciliationService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Operations endpoints, all behind ROLE_REVIEWER.
 *
 * These exist because a demo of tiered limits and drift detection needs a way to press
 * the buttons that night run and the review desk would press.
 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final KycRecordRepository records;
    private final ReconciliationService reconciliation;
    private final AuthService auth;

    public AdminController(KycRecordRepository records, ReconciliationService reconciliation, AuthService auth) {
        this.records = records;
        this.reconciliation = reconciliation;
        this.auth = auth;
    }

    @GetMapping("/kyc-queue")
    public List<Responses.ReviewItem> queue() {
        return records.findByStatusOrderByIdAsc(KycRecord.Status.SUBMITTED).stream()
                .map(r -> {
                    User subject = auth.require(r.getUserId());
                    return new Responses.ReviewItem(r.getId(), r.getTier(), subject.getEmail(),
                            subject.getFullName(), r.getDocumentType(), r.getDocumentLast4(),
                            r.getSubmittedAt());
                })
                .toList();
    }

    /**
     * Runs the ledger proof on demand. Repair is opt-in and off by default: recomputing
     * and comparing is safe to run any time, while moving a projection to match the
     * ledger is a decision someone with the reviewer role makes deliberately.
     */
    @PostMapping("/reconcile")
    public ReconciliationService.Summary reconcile(@RequestParam(defaultValue = "false") boolean repair) {
        return reconciliation.reconcile(repair);
    }
}
