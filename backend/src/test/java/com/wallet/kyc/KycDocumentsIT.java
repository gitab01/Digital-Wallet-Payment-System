package com.wallet.kyc;

import com.fasterxml.jackson.databind.JsonNode;
import com.wallet.config.WalletProperties;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Identity documents, from upload to approval, over the real HTTP surface.
 *
 * The interesting properties of this feature are all interactions between layers: a
 * file that is a valid image and something else at once, a tier that a number alone
 * cannot buy, a photograph that one customer may not read. None of those can be shown
 * against a mocked servlet, so every case here sends bytes the way a phone does.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class KycDocumentsIT {

    private static final String PASSWORD = "correct horse battery";

    @Autowired TestRestTemplate http;
    @Autowired com.fasterxml.jackson.databind.ObjectMapper json;
    @Autowired WalletProperties props;

    private String reviewerToken;

    @BeforeAll
    void seatTheReviewer() throws Exception {
        String email = props.getReviewers().get(0);
        ResponseEntity<String> session = http.postForEntity("/api/auth/register",
                signup(email, "Ops Reviewer", "1122"), String.class);
        if (session.getStatusCode() == HttpStatus.CONFLICT) {
            // The test database keeps its rows between runs, and the reviewer identity
            // is fixed by configuration, so a second run signs in rather than signing up.
            session = http.postForEntity("/api/auth/login",
                    Map.of("email", email, "password", PASSWORD), String.class);
            assertEquals(HttpStatus.OK, session.getStatusCode(),
                    "no reviewer session: " + session.getBody());
        } else {
            assertEquals(HttpStatus.CREATED, session.getStatusCode(),
                    "no reviewer session: " + session.getBody());
        }
        reviewerToken = tokens(session.getBody()).accessToken();
    }

    @Test
    @DisplayName("a submission cannot be approved on its number alone")
    void approvalWaitsForBothSidesOfTheCard() throws Exception {
        Session customer = registerCustomer("NATIONAL_ID");

        // One side is not enough, and the refusal has to name the side that is missing.
        upload(customer, "FRONT", jpeg(900, 560));
        assertEquals(List.of("BACK"), sidesMissing(getJson(customer, "/api/kyc"), 0),
                "a national ID still needs its reverse");

        ResponseEntity<String> blocked = decideRaw(reviewerToken, customer.recordId, true);
        assertEquals(HttpStatus.CONFLICT, blocked.getStatusCode());
        assertEquals("DOCUMENTS_INCOMPLETE", code(blocked), "the desk must be told why: " + blocked.getBody());
        assertTrue(blocked.getBody().contains("BACK"), "and told which side to ask for");

        upload(customer, "BACK", jpeg(900, 560));
        assertEquals(List.of(), sidesMissing(getJson(customer, "/api/kyc"), 0));

        ResponseEntity<String> approved = decideRaw(reviewerToken, customer.recordId, true);
        assertEquals(HttpStatus.OK, approved.getStatusCode(), approved.getBody());
        assertEquals(1, json.readTree(approved.getBody()).get("tier").asInt(),
                "the tier moves with the decision that approved the document");
    }

    @Test
    @DisplayName("a passport is verified from one page, so one page is enough")
    void passportNeedsOnlyItsInformationPage() {
        Session customer = registerCustomer("PASSPORT");
        upload(customer, "FRONT", jpeg(1000, 700));

        assertEquals(List.of(), sidesMissing(getJson(customer, "/api/kyc"), 0));
        assertEquals(HttpStatus.OK, decideRaw(reviewerToken, customer.recordId, true).getStatusCode());
    }

    @Test
    @DisplayName("a licence is a two-sided document whatever the file claims to be")
    void drivingLicenceNeedsBothSides() {
        Session customer = registerCustomer("DRIVING_LICENSE");
        upload(customer, "FRONT", jpeg(800, 500));
        assertEquals(List.of("BACK"), sidesMissing(getJson(customer, "/api/kyc"), 0));
        assertEquals(HttpStatus.CONFLICT, decideRaw(reviewerToken, customer.recordId, true).getStatusCode());
    }

    @Test
    @DisplayName("bytes that only claim to be a photograph are refused")
    void nonImagesAreRefusedByTheirContentsNotTheirNames() {
        Session customer = registerCustomer("NATIONAL_ID");

        ResponseEntity<String> text = uploadRaw(customer, "FRONT",
                "This is not an image, whatever the file extension says".getBytes(StandardCharsets.UTF_8),
                "id.jpg", MediaType.IMAGE_JPEG);
        assertEquals(HttpStatus.BAD_REQUEST, text.getStatusCode(), text.getBody());
        assertEquals("UNSUPPORTED_IMAGE", code(text), text.getBody());

        // A valid PNG is accepted, because the product photographs may be either format.
        ResponseEntity<String> png = uploadRaw(customer, "FRONT", pngBytes(700, 440), "id.png",
                MediaType.IMAGE_PNG);
        assertEquals(HttpStatus.CREATED, png.getStatusCode(), png.getBody());
    }

    @Test
    @DisplayName("an upload over the documented ceiling is refused before it is stored")
    void oversizedUploadsAreRefused() {
        Session customer = registerCustomer("NATIONAL_ID");
        ResponseEntity<String> response = uploadRaw(customer, "FRONT", new byte[9 * 1024 * 1024], "huge.jpg",
                MediaType.IMAGE_JPEG);
        assertEquals(HttpStatus.PAYLOAD_TOO_LARGE, response.getStatusCode(), response.getBody());
    }

    /**
     * Small on the wire, enormous in memory. A compressed image states its own size in a
     * header an attacker writes, so the megapixel ceiling is only real if it is read from
     * that header before the pixels are decoded: 6 MB of PNG can describe a billion
     * pixels, and a check placed after the decode would be paid for before it ran.
     */
    @Test
    @DisplayName("a file that lies about its size is refused by the size it claims")
    void headerBombIsRefusedWithoutBeingDecoded() {
        Session customer = registerCustomer("NATIONAL_ID");
        byte[] lying = pngBytes(320, 240);
        // PNG: 8-byte signature, then the IHDR chunk whose payload starts at byte 16 with
        // width and height as big-endian integers.
        writeBigEndian(lying, 16, 60_000);
        writeBigEndian(lying, 20, 60_000);

        ResponseEntity<String> refused = uploadRaw(customer, "FRONT", lying, "enormous.png",
                MediaType.IMAGE_PNG);
        assertEquals(HttpStatus.BAD_REQUEST, refused.getStatusCode(), refused.getBody());
        assertEquals("UNSUPPORTED_IMAGE", code(refused), refused.getBody());
    }

    @Test
    @DisplayName("the stored image carries no EXIF, so it carries no camera location")
    void storedBytesLoseTheMetadataTheyArrivedWith() throws Exception {
        Session customer = registerCustomer("NATIONAL_ID");
        byte[] withExif = spliceExif(jpeg(800, 500));
        assertTrue(containsMark(withExif, "Exif".getBytes(StandardCharsets.US_ASCII)),
                "the fixture must actually be an image carrying EXIF");

        long documentId = upload(customer, "FRONT", withExif);
        byte[] served = getImage(customer.accessToken, documentId);
        assertFalse(containsMark(served, "Exif".getBytes(StandardCharsets.US_ASCII)),
                "re-encoding has to drop the metadata block along with any GPS fix in it");
        assertEquals(0xFF, served[0] & 0xFF);
        assertEquals(0xD8, served[1] & 0xFF);
    }

    @Test
    @DisplayName("a customer cannot open another customer's identity photograph")
    void documentsAreReadableOnlyByTheirOwnerAndTheDesk() {
        Session owner = registerCustomer("NATIONAL_ID");
        long documentId = upload(owner, "FRONT", jpeg(640, 400));
        Session stranger = registerCustomer("NATIONAL_ID");

        assertEquals(HttpStatus.OK, imageStatus(owner.accessToken, documentId));
        assertEquals(HttpStatus.FORBIDDEN, imageStatus(stranger.accessToken, documentId));

        // A reviewer is not the owner and still must be able to look, which is the whole
        // point of the queue.
        assertEquals(HttpStatus.OK, imageStatus(reviewerToken, documentId));
    }

    @Test
    @DisplayName("the desk cannot approve its own verification")
    void reviewersCannotDecideTheirOwnSubmissions() throws Exception {
        ResponseEntity<String> session = http.postForEntity("/api/auth/login",
                Map.of("email", props.getReviewers().get(0), "password", PASSWORD), String.class);
        String token = tokens(session.getBody()).accessToken();

        // The reviewer signed up with a document too, and that submission is the one
        // they must not be able to decide.
        JsonNode own = json.readTree(
                http.exchange("/api/kyc", HttpMethod.GET, new HttpEntity<>(bearer(token)), String.class)
                        .getBody()).get("documents").get(0);
        long reviewerRecord = own.get("recordId").asLong();

        ResponseEntity<String> denied = decideRaw(token, reviewerRecord, true);
        assertEquals(HttpStatus.FORBIDDEN, denied.getStatusCode(), denied.getBody());
        assertEquals("SELF_REVIEW", code(denied));
        assertTrue(own.get("missing").size() > 0, "the reviewer never filed scans, so approval is doubly refused");

        JsonNode marked = queueItems().stream()
                .filter(i -> i.get("recordId").asLong() == reviewerRecord)
                .findFirst()
                .orElseThrow(() -> new AssertionError("a reviewer's own submission vanished from the queue"));
        assertTrue(marked.get("ownSubmission").asBoolean(), "the queue must mark it, not hide it");
        assertTrue(marked.get("email").asText().equalsIgnoreCase(props.getReviewers().get(0)));
    }

    @Test
    @DisplayName("the same photograph filed by two customers surfaces in the queue")
    void identicalScansAcrossCustomersAreFlagged() {
        byte[] scan = jpeg(760, 480);
        Session first = registerCustomer("NATIONAL_ID");
        Session second = registerCustomer("NATIONAL_ID");
        upload(first, "FRONT", scan);
        upload(second, "FRONT", scan);

        JsonNode mine = queueItems().stream()
                .filter(i -> i.get("recordId").asLong() == second.recordId)
                .findFirst()
                .orElseThrow(() -> new AssertionError("the second submission never reached the queue"));
        assertEquals(first.userId, mine.get("duplicateOfUserId").asLong(),
                "reusing somebody's ID card is the one thing the numbers alone cannot show");

        // The honest reading of a shared image is "look closely", never "blocked": a
        // customer re-filing their own card must stay approvable.
        upload(second, "BACK", jpeg(760, 480));
        assertEquals(HttpStatus.OK, decideRaw(reviewerToken, second.recordId, true).getStatusCode());
    }

    @Test
    @DisplayName("the operations console can find, freeze and explain a customer")
    void consoleManagesClients() throws Exception {
        Session customer = registerCustomer("NATIONAL_ID");
        long documentId = upload(customer, "FRONT", jpeg(700, 450));

        // Somebody has to be able to say who looked at a customer's ID; that is the whole
        // reason the reads are audited.
        getImage(reviewerToken, documentId);
        JsonNode trail = getJson(reviewerToken, "/api/admin/audit?action=KYC_DOCUMENT_VIEWED");
        assertTrue(trail.get("total").asLong() >= 1, "the viewer trail is empty");
        assertEquals("KYC_DOCUMENT_VIEWED", trail.get("items").get(0).get("action").asText());

        String fragment = customer.email.substring(0, customer.email.indexOf('@'));
        JsonNode page = getJson(reviewerToken, "/api/admin/clients?query=" + fragment);
        assertEquals(1, page.get("items").size(), "exactly the one account that fragment can name");
        assertEquals(customer.email, page.get("items").get(0).get("email").asText());

        ResponseEntity<String> suspended = http.postForEntity("/api/admin/clients/" + customer.userId + "/status",
                new HttpEntity<>(Map.of("status", "SUSPENDED"), jsonHeaders(reviewerToken)), String.class);
        assertEquals(HttpStatus.OK, suspended.getStatusCode(), suspended.getBody());
        assertEquals("SUSPENDED", json.readTree(suspended.getBody()).get("status").asText());

        ResponseEntity<String> login = http.postForEntity("/api/auth/login",
                Map.of("email", customer.email, "password", PASSWORD), String.class);
        assertEquals(HttpStatus.FORBIDDEN, login.getStatusCode(), "a frozen account must not start a session");

        // Suspension revokes the refresh tokens, so the sessions run out rather than
        // being renewed; and the ledger refuses to move money for a frozen account
        // whatever the token it arrives on.
        ResponseEntity<String> renewed = http.postForEntity("/api/auth/refresh",
                new HttpEntity<>(Map.of("refreshToken", customer.refreshToken), jsonOnly()), String.class);
        assertEquals(HttpStatus.UNAUTHORIZED, renewed.getStatusCode(),
                "a frozen account must not be able to renew its session");

        ResponseEntity<String> transfer = http.postForEntity("/api/transfers",
                new HttpEntity<>(Map.of("toEmail", customer.email, "amount", "10.00", "currency", "ETB",
                        "pin", "4321", "idempotencyKey", UUID.randomUUID().toString()),
                        jsonHeaders(customer.accessToken)), String.class);
        assertTrue(transfer.getStatusCode() == HttpStatus.FORBIDDEN
                        || transfer.getStatusCode() == HttpStatus.UNAUTHORIZED,
                "a frozen account must not move money: " + transfer.getStatusCode());

        JsonNode detail = getJson(reviewerToken, "/api/admin/clients/" + customer.userId);
        assertEquals("SUSPENDED", detail.get("user").get("status").asText());
        assertEquals(1, detail.get("kyc").get(0).get("tier").asInt());
    }

    @Test
    @DisplayName("an ordinary customer gets nothing from the operations surface")
    void ordinarySessionsCannotReachTheConsole() {
        Session customer = registerCustomer("NATIONAL_ID");
        for (String path : List.of("/api/admin/kyc-queue", "/api/admin/clients", "/api/admin/audit")) {
            ResponseEntity<String> denied = http.exchange(path, HttpMethod.GET,
                    new HttpEntity<>(bearer(customer.accessToken)), String.class);
            assertEquals(HttpStatus.FORBIDDEN, denied.getStatusCode(), path + " is not customer-facing");
        }
    }

    @Test
    @DisplayName("an unknown document type is refused at the door")
    void onlyDocumentTypesTheProductSupports() {
        ResponseEntity<String> response = http.postForEntity("/api/auth/register",
                signup("type-" + UUID.randomUUID() + "@test.local", "Unknown Type", "1122", "VOTER_CARD"),
                String.class);
        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode(), response.getBody());
    }

    // ------------------------------------------------------------------ fixture

    private static final Random IMAGES = new Random();

    private static final class Session {
        String email;
        long userId;
        String accessToken;
        String refreshToken;
        /** The open submission signup raised. */
        long recordId;
    }

    private Session registerCustomer(String documentType) {
        String email = "kyc-" + UUID.randomUUID().toString().substring(0, 10) + "@test.local";
        ResponseEntity<String> created = http.postForEntity("/api/auth/register",
                signup(email, "Document Tester", "4321", documentType), String.class);
        assertEquals(HttpStatus.CREATED, created.getStatusCode(), () -> "register failed: " + created.getBody());
        try {
            JsonNode body = json.readTree(created.getBody());
            Session session = new Session();
            session.email = email;
            session.userId = body.get("user").get("id").asLong();
            Tokens issued = tokens(created.getBody());
            session.accessToken = issued.accessToken();
            session.refreshToken = issued.refreshToken();
            // Signup opens the submission that awaits its scans, and the decision
            // endpoint works by record id, so it is read straight back.
            session.recordId = getJson(session, "/api/kyc").get("documents").get(0).get("recordId").asLong();
            return session;
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private long upload(Session session, String side, byte[] bytes) {
        ResponseEntity<String> response = uploadRaw(session, side, bytes, "document.jpg", MediaType.IMAGE_JPEG);
        assertEquals(HttpStatus.CREATED, response.getStatusCode(), response.getBody());
        try {
            return json.readTree(response.getBody()).get("id").asLong();
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private ResponseEntity<String> uploadRaw(Session session, String side, byte[] bytes,
                                            String filename, MediaType declared) {
        MultiValueMap<String, Object> parts = new LinkedMultiValueMap<>();
        parts.add("side", side);
        parts.add("file", new HttpEntity<>(new ByteArrayResource(bytes) {
            @Override
            public String getFilename() {
                return filename;
            }
        }, partHeaders(declared)));
        // No content type on the request itself: RestTemplate derives multipart/form-data
        // with its own boundary, and asserting a JSON type here would send a body the
        // server has declared it does not consume.
        return http.exchange("/api/kyc/documents", HttpMethod.POST,
                new HttpEntity<>(parts, bearer(session.accessToken)), String.class);
    }

    private static HttpHeaders partHeaders(MediaType type) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(type);
        return headers;
    }

    private HttpStatus imageStatus(String token, long documentId) {
        int code = http.exchange("/api/kyc/documents/" + documentId + "/image", HttpMethod.GET,
                new HttpEntity<>(bearer(token)), String.class).getStatusCode().value();
        return HttpStatus.resolve(code);
    }

    private byte[] getImage(String token, long documentId) {
        ResponseEntity<byte[]> response = http.exchange("/api/kyc/documents/" + documentId + "/image",
                HttpMethod.GET, new HttpEntity<>(bearer(token)), byte[].class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        return response.getBody();
    }

    private ResponseEntity<String> decideRaw(String token, long recordId, boolean approve) {
        return http.exchange("/api/kyc/" + recordId + "/decision", HttpMethod.POST,
                new HttpEntity<>(Map.of("approve", approve), jsonHeaders(token)), String.class);
    }

    private JsonNode getJson(Session session, String path) {
        return getJson(session.accessToken, path);
    }

    private JsonNode getJson(String token, String path) {
        ResponseEntity<String> response = http.exchange(path, HttpMethod.GET,
                new HttpEntity<>(bearer(token)), String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode(), response.getBody());
        try {
            return json.readTree(response.getBody());
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private List<JsonNode> queueItems() {
        ResponseEntity<String> response = http.exchange("/api/admin/kyc-queue", HttpMethod.GET,
                new HttpEntity<>(bearer(reviewerToken)), String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode(), response.getBody());
        List<JsonNode> items = new ArrayList<>();
        try {
            json.readTree(response.getBody()).forEach(items::add);
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
        return items;
    }

    private static List<String> sidesMissing(JsonNode kycView, int submissionIndex) {
        List<String> missing = new ArrayList<>();
        kycView.get("documents").get(submissionIndex).get("missing").forEach(n -> missing.add(n.asText()));
        return missing;
    }

    private String code(ResponseEntity<String> response) {
        try {
            return json.readTree(response.getBody()).get("code").asText();
        } catch (Exception ex) {
            return "unparseable: " + response.getBody();
        }
    }

    private static Map<String, String> signup(String email, String name, String pin) {
        return signup(email, name, pin, "NATIONAL_ID");
    }

    private static Map<String, String> signup(String email, String name, String pin, String documentType) {
        return Map.of(
                "email", email,
                "fullName", name,
                "password", PASSWORD,
                "pin", pin,
                "phone", "+2519000000" + email.length(),
                "dateOfBirth", "1990-01-01",
                "country", "ET",
                "documentType", documentType,
                "documentNumber", "DOC" + UUID.randomUUID().toString().replace("-", "")
                        .substring(0, 10).toUpperCase());
    }

    private static byte[] jpeg(int width, int height) {
        return encodeQuietly(width, height, "jpg");
    }

    private static byte[] pngBytes(int width, int height) {
        return encodeQuietly(width, height, "png");
    }

    /**
     * Every specimen carries a few random specks. Two different customers filing the
     * same fixture would otherwise be flagged as sharing an ID card, and the duplicate
     * test would be proving an accident of the fixture rather than the rule.
     */
    private static byte[] encode(int width, int height, String format) throws IOException {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_3BYTE_BGR);
        Graphics2D g = image.createGraphics();
        g.setColor(new Color(width % 256, height % 256, 128));
        g.fillRect(0, 0, width, height);
        for (int i = 0; i < 64; i++) {
            g.setColor(new Color(IMAGES.nextInt(256), IMAGES.nextInt(256), IMAGES.nextInt(256)));
            g.fillRect(IMAGES.nextInt(Math.max(1, width - 4)), IMAGES.nextInt(Math.max(1, height - 4)), 3, 3);
        }
        g.setColor(Color.WHITE);
        g.drawString("SPECIMEN " + width + "x" + height, 20, height / 2);
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, format, out);
        return out.toByteArray();
    }

    private static byte[] encodeQuietly(int width, int height, String format) {
        try {
            return encode(width, height, format);
        } catch (IOException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static void writeBigEndian(byte[] target, int offset, int value) {
        target[offset] = (byte) (value >> 24);
        target[offset + 1] = (byte) (value >> 16);
        target[offset + 2] = (byte) (value >> 8);
        target[offset + 3] = (byte) value;
    }

    /**
     * An APP1/Exif segment inserted after the start-of-image marker, which is exactly
     * where a camera puts the block that holds the coordinates of the shot.
     */
    private static byte[] spliceExif(byte[] jpeg) {
        byte[] payload = "Exif\0\0GPS=+09.0123,+038.7654".getBytes(StandardCharsets.US_ASCII);
        int segment = payload.length + 2;
        byte[] result = new byte[6 + payload.length + jpeg.length - 2];
        result[0] = (byte) 0xFF;
        result[1] = (byte) 0xD8;
        result[2] = (byte) 0xFF;
        result[3] = (byte) 0xE1;
        result[4] = (byte) ((segment >> 8) & 0xFF);
        result[5] = (byte) (segment & 0xFF);
        System.arraycopy(payload, 0, result, 6, payload.length);
        System.arraycopy(jpeg, 2, result, 6 + payload.length, jpeg.length - 2);
        return result;
    }

    private static boolean containsMark(byte[] haystack, byte[] needle) {
        outer:
        for (int i = 0; i + needle.length <= haystack.length; i++) {
            for (int j = 0; j < needle.length; j++) {
                if (haystack[i + j] != needle[j]) continue outer;
            }
            return true;
        }
        return false;
    }

    private static HttpHeaders bearer(String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        return headers;
    }

    private static HttpHeaders jsonHeaders(String token) {
        HttpHeaders headers = bearer(token);
        headers.setContentType(MediaType.APPLICATION_JSON);
        return headers;
    }

    private record Tokens(String accessToken, String refreshToken) {}

    private Tokens tokens(String body) {
        try {
            JsonNode node = json.readTree(body).get("tokens");
            assertNotNull(node, "response was not the documented session shape: " + body);
            return new Tokens(node.get("accessToken").asText(), node.get("refreshToken").asText());
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static HttpHeaders jsonOnly() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        return headers;
    }
}
