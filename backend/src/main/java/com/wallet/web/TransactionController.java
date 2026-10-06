package com.wallet.web;

import com.wallet.support.PageView;
import com.wallet.error.ApiException;
import com.wallet.security.SecurityUser;
import com.wallet.service.AuthService;
import com.wallet.service.StatementService;
import com.wallet.service.WalletQueryService;
import com.wallet.support.Times;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api")
public class TransactionController {

    private static final Instant EPOCH = Instant.parse("2000-01-01T00:00:00Z");

    private final WalletQueryService queries;
    private final StatementService statements;
    private final AuthService auth;

    public TransactionController(WalletQueryService queries, StatementService statements, AuthService auth) {
        this.queries = queries;
        this.statements = statements;
        this.auth = auth;
    }

    @GetMapping("/transactions")
    public PageView<WalletQueryService.TransactionRow> history(
            @RequestParam(required = false) Long accountId,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size) {

        Long userId = SecurityUser.requiredId();
        Page<com.wallet.domain.Transfer> found =
                queries.page(userId, accountId, lower(from), upper(to), page, size);
        List<WalletQueryService.TransactionRow> items = queries.rows(userId, found);
        return new PageView<>(items, found.getTotalElements(), found.getNumber(), found.getSize());
    }

    /**
     * The ledger entries behind one transaction, in the order they posted. This is what
     * makes a balance provable to a customer rather than merely asserted: both sides of
     * every movement, with the running balance each left behind.
     */
    @GetMapping("/transactions/{reference}")
    public WalletQueryService.TransactionDetail detail(@PathVariable String reference) {
        return queries.detail(SecurityUser.requiredId(), reference);
    }

    @GetMapping("/statements")
    public ResponseEntity<byte[]> statement(@RequestParam(required = false) Long accountId,
                                            @RequestParam(required = false) String from,
                                            @RequestParam(required = false) String to,
                                            @RequestParam(defaultValue = "csv") String format) {
        Long userId = SecurityUser.requiredId();
        List<WalletQueryService.TransactionRow> rows =
                statements.rows(userId, accountId, lower(from), upper(to));

        String kind = format == null ? "csv" : format.trim().toLowerCase();
        byte[] body;
        MediaType type;
        switch (kind) {
            case "csv" -> {
                body = statements.csv(rows);
                type = MediaType.parseMediaType("text/csv;charset=UTF-8");
            }
            case "pdf" -> {
                body = statements.pdf(auth.require(userId).getFullName(), rows);
                type = MediaType.APPLICATION_PDF;
            }
            default -> throw ApiException.of(HttpStatus.BAD_REQUEST, "UNSUPPORTED_FORMAT",
                    "Statements export as csv or pdf.");
        }

        String filename = "statement-" + LocalDate.now() + (accountId == null ? "" : "-account-" + accountId)
                + "." + kind;
        return ResponseEntity.ok()
                .contentType(type)
                // The filename is the only attachment signal a browser has; without it
                // the CSV opens as a wall of text.
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .body(body);
    }

    private static Instant lower(String value) {
        Instant parsed = Times.lowerBound(value);
        return parsed == null ? EPOCH : parsed;
    }

    private static Instant upper(String value) {
        Instant parsed = Times.upperBound(value);
        return parsed == null ? Instant.now() : parsed;
    }
}
