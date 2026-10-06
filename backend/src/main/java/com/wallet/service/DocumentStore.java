package com.wallet.service;

import com.wallet.config.WalletProperties;
import com.wallet.error.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.util.Iterator;
import java.util.UUID;

/**
 * Where identity scans physically live.
 *
 * Nothing about an accepted file is trusted because a browser said so. The declared
 * content type is ignored in favour of the leading bytes, the image is then decoded
 * and re-encoded from scratch, and only the re-encoded bytes reach the disk. That
 * re-encode is the actual security control rather than a quality step: it discards
 * EXIF (which carries the phone's GPS fix), discards everything appended after the
 * image data, and guarantees that a review desk is served a JPEG and nothing else,
 * because a file that is a valid image and a valid something-else at once cannot
 * survive being written out from its decoded pixels.
 */
@Service
public class DocumentStore {

    private static final Logger log = LoggerFactory.getLogger(DocumentStore.class);

    /** Above this the decoder is a memory-exhaustion vector, not a validator. */
    private static final long MAX_PIXELS = 40_000_000L;

    public record Stored(String key, int byteLength, String sha256) {}

    private final Path root;
    private final int maxBytes;
    private final int maxEdge;

    public DocumentStore(WalletProperties props) {
        this.root = Paths.get(props.getDocuments().getStorageDir()).toAbsolutePath().normalize();
        this.maxBytes = props.getDocuments().getMaxBytes();
        this.maxEdge = props.getDocuments().getMaxEdge();
    }

    public Stored store(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw ApiException.validation("A document image is required.",
                    java.util.Map.of("file", "empty"));
        }
        if (file.getSize() > maxBytes) {
            throw ApiException.of(org.springframework.http.HttpStatus.PAYLOAD_TOO_LARGE, "FILE_TOO_LARGE",
                    "A document image must be under " + (maxBytes / 1024 / 1024) + " MB.");
        }

        byte[] raw;
        try {
            raw = file.getBytes();
        } catch (IOException ex) {
            throw ApiException.validation("The upload could not be read.", java.util.Map.of());
        }

        if (!looksLikeJpeg(raw) && !looksLikePng(raw)) {
            throw ApiException.of(org.springframework.http.HttpStatus.BAD_REQUEST, "UNSUPPORTED_IMAGE",
                    "Upload a JPEG or PNG photograph of the document.");
        }

        byte[] normalised = reencode(raw);
        String key = write(keyFor(UUID.randomUUID().toString()), normalised);
        return new Stored(key, normalised.length, sha256(normalised));
    }

    public byte[] read(String key) {
        Path path = resolve(key);
        try {
            return Files.readAllBytes(path);
        } catch (IOException ex) {
            log.warn("document {} is on file but not on disk", key);
            throw ApiException.notFound("DOCUMENT_MISSING", "That image is no longer on file.");
        }
    }

    /**
     * Deleting the previous image of a replaced side. A failure here is logged and
     * swallowed: an orphaned file on the wrong disk is a cleanup problem, and turning
     * it into a failed upload for the customer would be worse.
     */
    public void delete(String key) {
        try {
            Files.deleteIfExists(resolve(key));
        } catch (IOException ex) {
            log.warn("could not remove superseded document {}", key, ex);
        }
    }

    /**
     * The only defence against a storage key that was not written here. Keys are
     * generated, but a row edited directly into the database must not be able to turn
     * the read path into an arbitrary file reader.
     */
    private Path resolve(String key) {
        Path path = root.resolve(key).normalize();
        if (!path.startsWith(root)) {
            throw ApiException.of(org.springframework.http.HttpStatus.BAD_REQUEST, "UNSUPPORTED_IMAGE",
                    "That document reference is not valid.");
        }
        return path;
    }

    private static String keyFor(String id) {
        LocalDate today = LocalDate.now();
        return String.format("%d/%02d/%s.jpg", today.getYear(), today.getMonthValue(), id);
    }

    private String write(String key, byte[] bytes) {
        Path path = root.resolve(key);
        try {
            Files.createDirectories(path.getParent());
            Files.write(path, bytes);
        } catch (IOException ex) {
            log.error("could not write document under {}", root, ex);
            throw new UncheckedIOException("Document storage is not writable", ex);
        }
        return key;
    }

    private byte[] reencode(byte[] raw) {
        // The header is inspected before anything is decoded, because a 6 MB PNG can
        // claim a thousand megapixels, and a check placed after the decode would be
        // refusing it after it had already been paid for.
        int[] declared = declaredSize(raw);
        if ((long) declared[0] * declared[1] > MAX_PIXELS) {
            throw tooLarge();
        }

        BufferedImage image;
        try {
            image = ImageIO.read(new ByteArrayInputStream(raw));
        } catch (IOException ex) {
            image = null;
        }
        if (image == null) {
            throw unreadable();
        }

        long pixels = (long) image.getWidth() * image.getHeight();
        if (pixels > MAX_PIXELS) {
            throw tooLarge();
        }

        double scale = Math.min(1.0d, (double) maxEdge / Math.max(image.getWidth(), image.getHeight()));
        int width = Math.max(1, (int) Math.round(image.getWidth() * scale));
        int height = Math.max(1, (int) Math.round(image.getHeight() * scale));

        // Painting onto an opaque white canvas is what drops an alpha channel and a
        // palette, both of which a JPEG cannot carry and a viewer cannot be trusted to
        // composite the same way the uploader's phone did.
        BufferedImage flat = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = flat.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g.setColor(java.awt.Color.WHITE);
            g.fillRect(0, 0, width, height);
            g.drawImage(image, 0, 0, width, height, null);
        } finally {
            g.dispose();
        }

        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName("jpeg");
        if (!writers.hasNext()) {
            throw new IllegalStateException("No JPEG encoder available in this JVM");
        }
        ImageWriter writer = writers.next();
        ByteArrayOutputStream out = new ByteArrayOutputStream(Math.max(1 << 13, raw.length / 4));
        try (ImageOutputStream ios = ImageIO.createImageOutputStream(out)) {
            writer.setOutput(ios);
            ImageWriteParam params = writer.getDefaultWriteParam();
            params.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            params.setCompressionQuality(0.85f);
            writer.write(null, new IIOImage(flat, null, null), params);
        } catch (IOException ex) {
            throw new UncheckedIOException("Could not encode the document image", ex);
        } finally {
            writer.dispose();
        }
        return out.toByteArray();
    }

    /**
     * Width and height as the file's own header states them. ImageIO answers these from
     * a JPEG start-of-frame block or a PNG IHDR without inflating the pixel data, which
     * is the only way the megapixel ceiling can be enforced before it is paid for.
     */
    private static int[] declaredSize(byte[] raw) {
        try (ImageInputStream header = ImageIO.createImageInputStream(new ByteArrayInputStream(raw))) {
            if (header == null) throw unreadable();
            Iterator<ImageReader> candidates = ImageIO.getImageReaders(header);
            if (!candidates.hasNext()) throw unreadable();
            ImageReader reader = candidates.next();
            try {
                reader.setInput(header, true, true);
                return new int[] { reader.getWidth(0), reader.getHeight(0) };
            } catch (IOException | RuntimeException ex) {
                throw unreadable();
            } finally {
                reader.dispose();
            }
        } catch (IOException ex) {
            throw unreadable();
        }
    }

    private static ApiException tooLarge() {
        return ApiException.of(org.springframework.http.HttpStatus.BAD_REQUEST, "UNSUPPORTED_IMAGE",
                "That image is too large to process. Re-take the photo.");
    }

    private static ApiException unreadable() {
        return ApiException.of(org.springframework.http.HttpStatus.BAD_REQUEST, "UNSUPPORTED_IMAGE",
                "That file is not a readable photograph.");
    }

    private static boolean looksLikeJpeg(byte[] b) {
        return b.length > 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF;
    }

    private static boolean looksLikePng(byte[] b) {
        int[] signature = { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };
        if (b.length < signature.length) return false;
        for (int i = 0; i < signature.length; i++) {
            if ((b[i] & 0xFF) != signature[i]) return false;
        }
        return true;
    }

    private static String sha256(byte[] bytes) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) hex.append(String.format("%02x", b));
            return hex.toString();
        } catch (Exception ex) {
            throw new IllegalStateException("SHA-256 unavailable", ex);
        }
    }

    /** Used by tests and the health check to say where the images are kept. */
    public Path storageRoot() {
        return root;
    }
}
