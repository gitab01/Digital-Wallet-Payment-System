package com.wallet.security;

import com.nimbusds.jose.jwk.JWK;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.wallet.config.WalletProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.security.KeyFactory;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A signing key ring rather than a single key.
 *
 * Tokens are signed with the current key and stamped with its id. Verification
 * resolves the key by that id, so a rotated key keeps validating the tokens it
 * issued until they expire on their own. That overlapping validity window is the
 * whole reason a rotation can happen without logging every customer out.
 */
@Component
public class JwtKeyRing {

    private static final Logger log = LoggerFactory.getLogger(JwtKeyRing.class);

    private final Map<String, RSAKey> byKid = new LinkedHashMap<>();
    private final RSAKey signingKey;

    public JwtKeyRing(WalletProperties props) {
        WalletProperties.Jwt jwt = props.getJwt();

        addKey(jwt.getKeyIdCurrent(), jwt.getPrivateKeyCurrent(), jwt.getPublicKeyCurrent(), true);
        // The previous key is verify-only: it has no private material loaded, so it
        // cannot sign anything even if the entry is present.
        addKey(jwt.getKeyIdPrevious(), null, jwt.getPublicKeyPrevious(), false);

        if (byKid.isEmpty()) {
            throw new IllegalStateException(
                "No JWT signing key configured. Set JWT_PRIVATE_KEY_CURRENT and "
              + "JWT_PUBLIC_KEY_CURRENT (run npm run provision in deploy/ to generate them).");
        }

        this.signingKey = byKid.get(jwt.getKeyIdCurrent());
        if (signingKey == null || !signingKey.isPrivate()) {
            throw new IllegalStateException(
                "The current JWT key (" + jwt.getKeyIdCurrent() + ") has no private material and cannot sign.");
        }
        log.info("JWT key ring ready: signing with '{}', verifying against {}",
                jwt.getKeyIdCurrent(), byKid.keySet());
    }

    private void addKey(String kid, String privateB64, String publicB64, boolean wantPrivate) {
        if (kid == null || kid.isBlank() || publicB64 == null || publicB64.isBlank()) return;
        if (byKid.containsKey(kid)) return;
        try {
            RSAKey.Builder builder = new RSAKey.Builder((RSAPublicKey) parsePublic(publicB64));
            if (wantPrivate && privateB64 != null && !privateB64.isBlank()) {
                builder.privateKey((RSAPrivateKey) parsePrivate(privateB64));
            }
            byKid.put(kid, builder.keyID(kid).build());
        } catch (Exception ex) {
            throw new IllegalStateException("JWT key '" + kid + "' could not be loaded: " + ex.getMessage(), ex);
        }
    }

    private static RSAPublicKey parsePublic(String base64) throws Exception {
        byte[] der = Base64.getMimeDecoder().decode(base64);
        return (RSAPublicKey) KeyFactory.getInstance("RSA")
                .generatePublic(new X509EncodedKeySpec(der));
    }

    private static RSAPrivateKey parsePrivate(String base64) throws Exception {
        byte[] der = Base64.getMimeDecoder().decode(base64);
        return (RSAPrivateKey) KeyFactory.getInstance("RSA")
                .generatePrivate(new PKCS8EncodedKeySpec(der));
    }

    public RSAKey signingKey() {
        return signingKey;
    }

    public String signingKeyId() {
        return signingKey.getKeyID();
    }

    /** Resolves by key id; returns null when a token names a key this service no longer trusts. */
    public RSAKey verifier(String kid) {
        return kid == null ? null : byKid.get(kid);
    }

    /** Public half only, for the JWKS endpoint. No private material is ever exported. */
    public JWKSet publicJwkSet() {
        List<JWK> keys = new ArrayList<>();
        for (RSAKey k : byKid.values()) keys.add(k.toPublicJWK());
        return new JWKSet(keys);
    }
}
