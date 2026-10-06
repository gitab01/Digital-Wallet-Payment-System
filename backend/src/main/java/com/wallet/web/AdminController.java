package com.wallet.web;

import com.wallet.support.PageView;
import com.wallet.security.SecurityUser;
import com.wallet.service.AdminService;
import com.wallet.service.KycDocumentService;
import com.wallet.service.ReconciliationService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * The operations console: who is waiting to be verified, who the customers are, and
 * what can be done about them.
 *
 * Every route here is behind ROLE_REVIEWER in the filter chain, and the role comes from
 * configuration rather than from a column, so nobody holding a session in this system
 * can promote themselves into it.
 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AdminService admin;
    private final ReconciliationService reconciliation;

    public AdminController(AdminService admin, ReconciliationService reconciliation) {
        this.admin = admin;
        this.reconciliation = reconciliation;
    }

    @GetMapping("/kyc-queue")
    public List<AdminService.QueueItem> queue() {
        return admin.queue(SecurityUser.requiredId());
    }

    /** Which images a submission carries, so the desk can then fetch them by id. */
    @GetMapping("/kyc/{recordId}/documents")
    public List<KycDocumentService.View> documents(@PathVariable Long recordId) {
        return admin.documentsFor(recordId);
    }

    @GetMapping("/clients")
    public PageView<AdminService.ClientRow> clients(
            @RequestParam(required = false) String query,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return admin.clients(query, status, page, size);
    }

    @GetMapping("/clients/{id}")
    public AdminService.ClientView client(@PathVariable Long id) {
        return admin.client(id);
    }

    @PostMapping("/clients/{id}/status")
    public AdminService.AdminUserView setStatus(@PathVariable Long id,
                                               @Valid @RequestBody Requests.StatusRequest body) {
        return admin.setStatus(id, body.status(), SecurityUser.requiredId());
    }

    @PostMapping("/clients/{id}/withdrawal-freeze")
    public AdminService.AdminUserView freeze(@PathVariable Long id,
                                             @Valid @RequestBody Requests.FreezeRequest body) {
        return admin.freezeWithdrawals(id, body.frozen(), SecurityUser.requiredId());
    }

    @PostMapping("/clients/{id}/pin-unlock")
    public ResponseEntity<Void> unlockPin(@PathVariable Long id) {
        admin.unlockPin(id, SecurityUser.requiredId());
        return ResponseEntity.noContent().build();
    }

    /**
     * The whole trail, not one customer's slice of it. This is where "who opened that
     * person's identity photograph" gets answered, which is the reason document reads
     * are audited at all.
     */
    @GetMapping("/audit")
    public PageView<AdminService.AuditRow> audit(
            @RequestParam(required = false) String action,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return admin.audit(action, page, size);
    }

    /**
     * Runs the ledger proof on demand. Repair is opt-in and off by default: recomputing
     * and comparing is safe to run any time, while moving a projection to match the
     * ledger is a decision somebody with the reviewer role makes deliberately.
     */
    @PostMapping("/reconcile")
    public ReconciliationService.Summary reconcile(@RequestParam(defaultValue = "false") boolean repair) {
        return reconciliation.reconcile(repair);
    }
}
