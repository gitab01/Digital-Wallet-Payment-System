package com.wallet.service;

import com.wallet.config.WalletProperties;
import com.wallet.domain.Account;
import com.wallet.domain.AuditLog;
import com.wallet.domain.RefreshToken;
import com.wallet.domain.User;
import com.wallet.error.ApiException;
import com.wallet.repository.AccountRepository;
import com.wallet.repository.UserRepository;
import com.wallet.security.TokenService;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Sign-up, sign-in and the token lifecycle.
 *
 * A new customer is opened at tier 0 with three currency wallets, all at zero. The
 * money model needs those rows to exist before any entry can point at them, which is
 * why onboarding is one transaction: a half-created customer would have an account
 * that can never hold money.
 */
@Service
public class AuthService {

    static final List<String> SUPPORTED_CURRENCIES = List.of("ETB", "USD", "EUR");

    public record Tokens(String accessToken, String refreshToken, long expiresIn, String tokenType) {}

    public record Session(User user, Tokens tokens) {}

    private final UserRepository users;
    private final AccountRepository accounts;
    private final PasswordEncoder encoder;
    private final TokenService tokens;
    private final RefreshTokenService refresh;
    private final KycService kyc;
    private final AuditService audit;
    private final WalletProperties props;

    public AuthService(UserRepository users, AccountRepository accounts, PasswordEncoder encoder,
                       TokenService tokens, RefreshTokenService refresh, KycService kyc,
                       AuditService audit, WalletProperties props) {
        this.users = users;
        this.accounts = accounts;
        this.encoder = encoder;
        this.tokens = tokens;
        this.refresh = refresh;
        this.kyc = kyc;
        this.audit = audit;
        this.props = props;
    }

    @Transactional
    public Session register(String email, String fullName, String password, String pin, String documentType,
                            String documentNumber, String phone, java.time.LocalDate dateOfBirth, String country) {
        String normalised = normalise(email);
        if (users.findByEmail(normalised).isPresent()) {
            throw ApiException.conflict("EMAIL_TAKEN", "An account already uses that e-mail.");
        }
        if (password == null || password.length() < 10) {
            throw ApiException.of(HttpStatus.BAD_REQUEST, "WEAK_PASSWORD",
                    "A password must be at least 10 characters.");
        }
        if (pin == null || !pin.matches("\\d{4}")) {
            throw ApiException.of(HttpStatus.BAD_REQUEST, "PIN_REQUIRED", "A PIN must be exactly 4 digits.");
        }

        User user = new User();
        user.setEmail(normalised);
        user.setFullName(fullName.trim());
        user.setPasswordHash(encoder.encode(password));
        user.setPinHash(encoder.encode(pin));
        user.setKycTier(0);
        user.setStatus(User.Status.PENDING_KYC);
        users.saveAndFlush(user);

        for (String currency : SUPPORTED_CURRENCIES) {
            Account wallet = new Account();
            wallet.setUserId(user.getId());
            wallet.setCurrency(currency);
            wallet.setKind(Account.Kind.CUSTOMER_WALLET);
            wallet.setLabel(currency + " wallet");
            wallet.setBalanceCents(0);
            wallet.setProjectionAt(Instant.now());
            accounts.save(wallet);
        }

        kyc.submitOnboarding(user, documentType, documentNumber, phone, dateOfBirth, country);

        audit.record(AuditService.Action.REGISTER, AuditLog.Outcome.SUCCESS, user.getId(), user.getEmail());
        return new Session(user, issueTokens(user, null));
    }

    @Transactional
    public Session login(String email, String password) {
        User user = users.findByEmail(normalise(email)).orElse(null);

        // Same message and same work either way: an attacker probing this endpoint
        // cannot learn which e-mails are customers.
        if (user == null || !encoder.matches(password == null ? "" : password, user.getPasswordHash())) {
            audit.recordDetached(AuditService.Action.LOGIN_FAILED, AuditLog.Outcome.DENIED,
                    user == null ? null : user.getId(), normalise(email));
            throw badCredentials();
        }
        if (user.getStatus() == User.Status.SUSPENDED || user.getStatus() == User.Status.CLOSED) {
            throw ApiException.of(HttpStatus.FORBIDDEN, "ACCOUNT_NOT_ACTIVE",
                    "This account may not be signed in to.");
        }

        audit.record(AuditService.Action.LOGIN, AuditLog.Outcome.SUCCESS, user.getId(), user.getEmail());
        return new Session(user, issueTokens(user, null));
    }

    /**
     * Rotation: the presented token is consumed and its replacement carries the same
     * family id, so the family is what reuse detection revokes.
     */
    @Transactional
    public Tokens refresh(String refreshToken) {
        RefreshToken original = refresh.findRow(refreshToken);
        long userId = refresh.consume(refreshToken, props.getJwt().getRefreshTtl().toSeconds());
        User user = users.findById(userId).orElseThrow(AuthService::badCredentials);

        RefreshTokenService.Issued next = refresh.issue(userId, original == null ? null : original.getFamilyId());
        if (original != null) refresh.markReplaced(original, next.row());
        return issueTokens(user, next.token());
    }

    @Transactional
    public void logout(String refreshToken) {
        if (refreshToken != null && !refreshToken.isBlank()) refresh.revokeFamilyOf(refreshToken);
    }

    private Tokens issueTokens(User user, String refreshToken) {
        String access = tokens.issueAccessToken(user, rolesOf(user));
        String refreshValue = refreshToken == null
                ? refresh.issue(user.getId(), null).token()
                : refreshToken;
        return new Tokens(access, refreshValue, tokens.accessTtlSeconds(), "Bearer");
    }

    /**
     * Reviewer rights come from configuration, not from a column: the people who can
     * approve tiers are named at deploy time and cannot promote themselves.
     */
    public List<String> rolesOf(User user) {
        return props.isReviewer(user.getEmail())
                ? List.of("ROLE_USER", "ROLE_REVIEWER")
                : List.of("ROLE_USER");
    }

    public User require(Long userId) {
        return users.findById(userId)
                .orElseThrow(() -> ApiException.notFound("USER_NOT_FOUND", "No customer for this session."));
    }

    private static String normalise(String email) {
        if (email == null || !email.matches("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")) {
            throw ApiException.of(HttpStatus.BAD_REQUEST, "INVALID_EMAIL", "That is not a valid e-mail address.");
        }
        return email.trim().toLowerCase();
    }

    private static ApiException badCredentials() {
        return ApiException.of(HttpStatus.UNAUTHORIZED, "BAD_CREDENTIALS", "E-mail or password is incorrect.");
    }
}
