package com.wallet.web;

import com.wallet.domain.User;
import com.wallet.security.SecurityUser;
import com.wallet.service.AuthService;
import com.wallet.service.KycDocumentService;
import com.wallet.service.KycService;
import com.wallet.service.WalletQueryService;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api")
public class KycController {

    private final KycService kyc;
    private final KycDocumentService documents;
    private final AuthService auth;
    private final WalletQueryService queries;

    public KycController(KycService kyc, KycDocumentService documents, AuthService auth,
                         WalletQueryService queries) {
        this.kyc = kyc;
        this.documents = documents;
        this.auth = auth;
        this.queries = queries;
    }

    @GetMapping("/kyc")
    public Responses.KycView overview() {
        Long userId = SecurityUser.requiredId();
        User user = auth.require(userId);
        List<KycService.Submission> submissions = kyc.history(userId);
        KycService.Submission latest = submissions.isEmpty() ? null : submissions.get(0);

        return new Responses.KycView(user.getKycTier(),
                latest == null ? "NOT_SUBMITTED" : latest.status().name(),
                latest == null ? null : latest.submittedAt(),
                latest == null ? null : latest.reviewedAt(),
                submissions,
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
     * One side of the document, per call. Two calls for a national ID or a licence,
     * one for a passport. The client could send both in one request, but then a failure
     * on the second image would also undo the first, and a customer who has just taken
     * two photographs with a phone on a weak connection deserves to keep the one that
     * arrived.
     */
    @PostMapping(path = "/kyc/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<KycDocumentService.View> upload(@RequestParam String side,
                                                          @RequestPart("file") MultipartFile file) {
        KycDocumentService.View saved = documents.upload(SecurityUser.requiredId(), side, file);
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }

    /**
     * The image bytes. The access decision is inside the service, because whether the
     * caller may see this depends on which submission the image belongs to.
     */
    @GetMapping("/kyc/documents/{id}/image")
    public ResponseEntity<byte[]> image(@PathVariable Long id) {
        byte[] bytes = documents.readForViewer(id, SecurityUser.requiredId(), isReviewer());
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_JPEG)
                // A cached identity photograph is a photograph of a customer sitting in
                // a shared browser's memory.
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=document-" + id + ".jpg")
                .body(bytes);
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
        var reviewer = SecurityUser.principal();
        return kyc.decide(id, body.approve(), reviewer.userId(), reviewer.email());
    }

    private static final String DEFAULT_CURRENCY = "ETB";

    private boolean isReviewer() {
        var principal = SecurityUser.principal();
        return principal != null && principal.roles().contains("ROLE_REVIEWER");
    }

    private static LocalDate date(String value) {
        return value == null || value.isBlank() ? null : LocalDate.parse(value);
    }
}
