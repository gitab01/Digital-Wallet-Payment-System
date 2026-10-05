package com.wallet.web;

import com.wallet.security.SecurityUser;
import com.wallet.service.TransferService;
import com.wallet.support.Money;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class TransferController {

    private final TransferService transfers;

    public TransferController(TransferService transfers) {
        this.transfers = transfers;
    }

    /**
     * Live pre-flight while the user types: what the fee is, what leaves the account,
     * and how much daily capacity remains. It carries no PIN and moves no money, so a
     * client can call it on every keystroke without a second factor being spent.
     */
    @GetMapping("/transfers/quote")
    public TransferService.Quote quote(@RequestParam String toEmail,
                                       @RequestParam String currency,
                                       @RequestParam String amount) {
        return transfers.quote(SecurityUser.requiredId(), toEmail, currency, Money.toCents(amount));
    }

    /**
     * The only place a transfer becomes real. The response is the balance the client
     * shows: there is no optimistic update, because a number that turns out to be wrong
     * in a payments app destroys trust in every other number on the screen.
     */
    @PostMapping("/transfers")
    public TransferService.Result transfer(@Valid @RequestBody Requests.TransferRequest body) {
        return transfers.transfer(SecurityUser.requiredId(), body.toEmail(), body.currency(),
                Money.toCents(body.amount()), body.pin(), body.idempotencyKey());
    }

    @PostMapping("/funds/deposit")
    public TransferService.Result deposit(@Valid @RequestBody Requests.FundsRequest body) {
        return transfers.deposit(SecurityUser.requiredId(), body.currency(), Money.toCents(body.amount()),
                body.pin(), body.idempotencyKey());
    }

    @PostMapping("/funds/withdraw")
    public TransferService.Result withdraw(@Valid @RequestBody Requests.FundsRequest body) {
        return transfers.withdraw(SecurityUser.requiredId(), body.currency(), Money.toCents(body.amount()),
                body.pin(), body.idempotencyKey());
    }
}
