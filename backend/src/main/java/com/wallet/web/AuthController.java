package com.wallet.web;

import com.nimbusds.jose.jwk.JWK;
import com.wallet.security.JwtKeyRing;
import com.wallet.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class AuthController {

    private final AuthService auth;
    private final JwtKeyRing keyRing;

    public AuthController(AuthService auth, JwtKeyRing keyRing) {
        this.auth = auth;
        this.keyRing = keyRing;
    }

    @PostMapping("/auth/register")
    public ResponseEntity<Responses.SessionView> register(@Valid @RequestBody Requests.RegisterRequest body) {
        AuthService.Session session = auth.register(body.email(), body.fullName(), body.password(), body.pin(),
                body.documentType(), body.documentNumber(), body.phone(), date(body.dateOfBirth()),
                body.country());
        return ResponseEntity.status(HttpStatus.CREATED).body(session(session));
    }

    @PostMapping("/auth/login")
    public Responses.SessionView login(@Valid @RequestBody Requests.LoginRequest body) {
        return session(auth.login(body.email(), body.password()));
    }

    @PostMapping("/auth/refresh")
    public AuthService.Tokens refresh(@Valid @RequestBody Requests.RefreshRequest body) {
        return auth.refresh(body.refreshToken());
    }

    @PostMapping("/auth/logout")
    public ResponseEntity<Void> logout(@RequestBody(required = false) Requests.RefreshRequest body) {
        auth.logout(body == null ? null : body.refreshToken());
        return ResponseEntity.noContent().build();
    }

    /**
     * The public halves of the signing keys. Anyone can read this: it is what lets a
     * client or another service verify a token without being handed the private key,
     * and it is why rotated keys keep validating during the overlap window.
     */
    @GetMapping("/jwks")
    public Map<String, Object> jwks() {
        Map<String, Object> document = new LinkedHashMap<>();
        document.put("keys", keyRing.publicJwkSet().getKeys().stream()
                .map(JWK::toJSONObject)
                .toList());
        return document;
    }

    private static Responses.SessionView session(AuthService.Session session) {
        return new Responses.SessionView(Responses.user(session.user()), session.tokens());
    }

    private static LocalDate date(String value) {
        return value == null || value.isBlank() ? null : LocalDate.parse(value);
    }
}
