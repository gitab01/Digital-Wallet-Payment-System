package com.wallet.service;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * Statement export as CSV and PDF.
 *
 * Both formats render the same rows the customer sees on screen, produced from the
 * ledger-backed history rather than a second query path, so an exported statement
 * cannot disagree with the screen it was exported from.
 */
@Service
public class StatementService {

    private static final DateTimeFormatter TS =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZoneOffset.UTC);

    private static final String[] HEADERS =
            {"Occurred (UTC)", "Reference", "Type", "Dir", "Counterparty", "Ccy", "Amount", "Fee", "Status"};

    /** Left edge of each PDF column. A4 is 595 points wide with a 36 point margin. */
    private static final float[] COLUMNS = {36, 120, 200, 250, 288, 388, 424, 480, 528};

    private static final int PER_PAGE = 42;

    private final WalletQueryService queries;

    public StatementService(WalletQueryService queries) {
        this.queries = queries;
    }

    public List<WalletQueryService.TransactionRow> rows(Long userId, Long accountId, Instant from, Instant to) {
        return queries.rows(userId, queries.page(userId, accountId, from, to, 0, 100));
    }

    public byte[] csv(List<WalletQueryService.TransactionRow> rows) {
        StringBuilder out = new StringBuilder();
        // Excel decides a file's encoding by sniffing its content, and without a
        // byte-order mark it reads UTF-8 names as mojibake.
        out.append("﻿");
        out.append(String.join(",", HEADERS)).append("\r\n");
        for (WalletQueryService.TransactionRow r : rows) {
            out.append(cell(TS.format(r.occurredAt()))).append(',')
               .append(cell(r.reference())).append(',')
               .append(cell(r.type())).append(',')
               .append(cell(r.direction())).append(',')
               .append(cell(r.counterparty())).append(',')
               .append(cell(r.currency())).append(',')
               .append(cell(r.amount())).append(',')
               .append(cell(r.fee())).append(',')
               .append(cell(r.status() + " | entries " + r.ledgerEntryIds())).append("\r\n");
        }
        return out.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
    }

    public byte[] pdf(String holderName, List<WalletQueryService.TransactionRow> rows) {
        try (PDDocument document = new PDDocument(); ByteArrayOutputStream sink = new ByteArrayOutputStream()) {
            int pages = Math.max(1, (rows.size() + PER_PAGE - 1) / PER_PAGE);

            for (int page = 0; page < pages; page++) {
                List<WalletQueryService.TransactionRow> chunk =
                        rows.subList(page * PER_PAGE, Math.min(rows.size(), (page + 1) * PER_PAGE));
                PDPage sheet = new PDPage(PDRectangle.A4);
                document.addPage(sheet);

                try (PDPageContentStream stream = new PDPageContentStream(document, sheet)) {
                    text(stream, PDType1Font.HELVETICA_BOLD, 14, 36, 792, "Digital Wallet - Account Statement");
                    text(stream, PDType1Font.HELVETICA, 9, 36, 776,
                            "Account holder: " + nullToEmpty(holderName)
                                    + "      Generated: " + TS.format(Instant.now()) + " UTC"
                                    + "      Rows: " + rows.size()
                                    + "      Page " + (page + 1) + " of " + pages);

                    for (int i = 0; i < COLUMNS.length; i++) {
                        text(stream, PDType1Font.HELVETICA_BOLD, 8, COLUMNS[i], 748, HEADERS[i]);
                    }

                    float y = 732;
                    for (WalletQueryService.TransactionRow r : chunk) {
                        String[] cells = {
                                TS.format(r.occurredAt()), r.reference(), r.type(), r.direction(),
                                shorten(r.counterparty(), 16), r.currency(),
                                ("OUT".equals(r.direction()) ? "-" : "+") + r.amount(), r.fee(), r.status()};
                        for (int i = 0; i < COLUMNS.length; i++) {
                            text(stream, PDType1Font.HELVETICA, 8, COLUMNS[i], y, cells[i]);
                        }
                        y -= 15;
                    }
                }
            }

            document.save(sink);
            return sink.toByteArray();
        } catch (Exception ex) {
            throw new IllegalStateException("Statement PDF could not be produced", ex);
        }
    }

    private static void text(PDPageContentStream stream, PDType1Font font, float size,
                             float x, float y, String value) throws java.io.IOException {
        stream.beginText();
        stream.setFont(font, size);
        stream.newLineAtOffset(x, y);
        stream.showText(sanitise(value));
        stream.endText();
    }

    /** The built-in Helvetica has no glyph outside Latin-1; an unmapped character would abort the page. */
    private static String sanitise(String value) {
        StringBuilder sb = new StringBuilder(value.length());
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            sb.append(c < 32 || c > 126 ? ' ' : c);
        }
        return sb.toString();
    }

    private static String shorten(String value, int max) {
        if (value == null) return "";
        return value.length() <= max ? value : value.substring(0, max);
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    /** CSV quoting: wrap and double any embedded quote so a name containing a comma stays one field. */
    private static String cell(String value) {
        if (value == null) return "";
        if (!value.contains(",") && !value.contains("\"") && !value.contains("\n")) return value;
        return '"' + value.replace("\"", "\"\"") + '"';
    }
}
