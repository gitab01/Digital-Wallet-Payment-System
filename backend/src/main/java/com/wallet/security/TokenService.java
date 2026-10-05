package com.wallet.security;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.crypto.RSASSAVerifier;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.wallet.config.WalletProperties;
import com.wallet.domain.User;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Issues and validates access tokens. Deliberately thin over Nimbus rather than
 * pulling in a resource-server stack: the only interesting behaviour here is
 * choosing the verification key by the id the token carries.
 */
@Service
public class TokenService {

    public static final String CLAIM_TYPE = "typ";
    public static final String CLAIM_TIER = "tier";
    public static final String CLAIM_EMAIL = "email";
    public static final String CLAIM_ROLES = "roles";
    public static final String ACCESS = "access";

    private final JwtKeyRing keyRing;
    private final WalletProperties props;

    public TokenService(JwtKeyRing keyRing, WalletProperties props) {
        this.keyRing = keyRing;
        this.props = props;
    }

    public String issueAccessToken(User user, List<String> roles) {
        Instant now = Instant.now();
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .issuer(props.getJwt().getIssuer())
                .subject(String.valueOf(user.getId()))
                .claim(CLAIM_EMAIL, user.getEmail())
                .claim(CLAIM_TIER, user.getKycTier())
                .claim(CLAIM_ROLES, roles)
                .claim(CLAIM_TYPE, ACCESS)
                .jwtID(UUID.randomUUID().toString())
                .issueTime(Date.from(now))
                .expirationTime(Date.from(now.plus(props.getJwt().getAccessTtl())))
                .build();

        JWSHeader header = new JWSHeader.Builder(JWSAlgorithm.RS256)
                .keyID(keyRing.signingKeyId())
                .type(JOSEObjectType.JWT)
                .build();

        try {
            SignedJWT jwt = new SignedJWT(header, claims);
            jwt.sign(new RSASSASigner(keyRing.signingKey()));
            return jwt.serialize();
        } catch (Exception ex) {
            throw new IllegalStateException("could not sign access token", ex);
        }
    }

    /**
     * Returns the authenticated principal only when the token is intact, signed by
     * a key this service still trusts, unexpired, and of the access type. A refresh
     * token replayed here must fail, which is what the typ claim is for.
     */
    public Optional<AuthPrincipal> verifyAccessToken(String token) {
        try {
            SignedJWT jwt = SignedJWT.parse(token);
            String kid = jwt.getHeader().getKeyID();
            RSAKey key = keyRing.verifier(kid);
            if (key == null || !jwt.verify(new RSASSAVerifier(key.toPublicJWK()))) return Optional.empty();

            JWTClaimsSet c = jwt.getJWTClaimsSet();
            if (!props.getJwt().getIssuer().equals(c.getIssuer())) return Optional.empty();
            if (c.getExpirationTime() == null || c.getExpirationTime().toInstant().isBefore(Instant.now())) {
                return Optional.empty();
            }
            if (!ACCESS.equals(c.getStringClaim(CLAIM_TYPE))) return Optional.empty();

            Long userId = Long.valueOf(c.getSubject());
            @SuppressWarnings("unchecked")
            List<String> roles = (List<String>) c.getClaim(CLAIM_ROLES);
            return Optional.of(new AuthPrincipal(userId, c.getStringClaim(CLAIM_EMAIL),
                    roles == null ? List.of() : roles));
        } catch (Exception ex) {
            return Optional.empty();
        }
    }

    public long accessTtlSeconds() {
        return props.getJwt().getAccessTtl().toSeconds();
    }

    /** The authenticated identity carried through the request. */
    public record AuthPrincipal(Long userId, String email, List<String> roles) {}
}
