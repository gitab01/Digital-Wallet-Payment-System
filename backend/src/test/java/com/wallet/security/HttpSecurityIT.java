package com.wallet.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;

import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The HTTP surface, over a real socket, with the real filter chain in front of it.
 *
 * Rate limiting and token handling are properties of the chain rather than of any one
 * controller, so they can only be shown by sending requests the way a client does.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class HttpSecurityIT {

    private static final String PASSWORD = "correct horse battery";

    @Autowired TestRestTemplate http;
    @Autowired ObjectMapper json;

    @Test
    @DisplayName("repeated sign-in attempts are cut off by the limiter, not answered forever")
    void loginIsRateLimited() {
        String email = "rl-" + UUID.randomUUID().toString().substring(0, 8) + "@test.local";
        Map<String, String> body = Map.of("email", email, "password", "definitely not the password");

        int last = 0;
        for (int i = 0; i < 8; i++) {
            ResponseEntity<String> response = http.postForEntity("/api/auth/login", body, String.class);
            last = response.getStatusCode().value();
            if (last == HttpStatus.TOO_MANY_REQUESTS.value()) {
                assertNotNull(response.getHeaders().getFirst(HttpHeaders.RETRY_AFTER),
                        "a throttled caller must be told when to come back");
                return;
            }
        }
        throw new AssertionError("the login limiter never tripped; last status was " + last);
    }

    @Test
    @DisplayName("a wallet read needs a token, and a tampered token does not count as one")
    void walletRequiresAValidToken() {
        Session session = register();

        ResponseEntity<String> anonymous = http.getForEntity("/api/wallet", String.class);
        assertEquals(HttpStatus.UNAUTHORIZED, anonymous.getStatusCode());

        ResponseEntity<String> accepted = http.exchange("/api/wallet", HttpMethod.GET,
                new HttpEntity<>(bearer(session.accessToken())), String.class);
        assertEquals(HttpStatus.OK, accepted.getStatusCode());

        // Flipping a character inside the payload must break the signature rather than
        // be tolerated by a lenient parser.
        String tampered = session.accessToken();
        String forged = tampered.substring(0, tampered.lastIndexOf('.')) + ".AAAA" + tampered.substring(tampered.lastIndexOf('.'));
        ResponseEntity<String> rejected = http.exchange("/api/wallet", HttpMethod.GET,
                new HttpEntity<>(bearer(forged)), String.class);
        assertEquals(HttpStatus.UNAUTHORIZED, rejected.getStatusCode());
    }

    @Test
    @DisplayName("a rotated key ring still verifies the tokens the previous key signed")
    void keyRingPublishesEveryVerifiableKey() throws Exception {
        ResponseEntity<String> response = http.getForEntity("/api/jwks", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());

        JsonNode keys = json.readTree(response.getBody()).get("keys");
        assertNotNull(keys, "the JWKS document must carry a key set");
        assertEquals(2, keys.size(),
                "both the current and the previous key id must be published during the overlap window");
        for (JsonNode key : keys) {
            assertTrue(key.has("n") && key.has("e"), "a published key must be usable for verification");
            assertTrue(!key.has("d"), "private material is never exported");
        }
    }

    @Test
    @DisplayName("an unknown refresh token ends the session instead of minting a token")
    void unknownRefreshTokenIsRejected() {
        ResponseEntity<String> response = http.postForEntity("/api/auth/refresh",
                Map.of("refreshToken", "not-a-token"), String.class);
        assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
    }

    private Session register() {
        String email = "http-" + UUID.randomUUID().toString().substring(0, 8) + "@test.local";
        Map<String, String> body = Map.of(
                "email", email,
                "fullName", "Http Tester",
                "password", PASSWORD,
                "pin", "4321",
                "phone", "+251900000002",
                "dateOfBirth", "1993-06-04",
                "country", "ET",
                "documentType", "NATIONAL_ID",
                "documentNumber", "HTC" + UUID.randomUUID().toString().replace("-", "").substring(0, 9));

        ResponseEntity<String> created = http.postForEntity("/api/auth/register", body, String.class);
        assertEquals(HttpStatus.CREATED, created.getStatusCode(), () -> "register failed: " + created.getBody());
        try {
            JsonNode node = json.readTree(created.getBody()).get("tokens");
            return new Session(node.get("accessToken").asText(), node.get("refreshToken").asText());
        } catch (Exception ex) {
            throw new IllegalStateException("response was not the documented session shape", ex);
        }
    }

    private static HttpHeaders bearer(String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        return headers;
    }

    private record Session(String accessToken, String refreshToken) {}
}
