package com.wallet.web;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Inbound payloads.
 *
 * Every field is validated here rather than trusted downstream: money arrives as a
 * two-decimal string with an explicit shape, so a client that sends a float, an
 * exponent, or nine decimals is rejected at the boundary instead of being rounded into
 * a number nobody agreed to move.
 */
public final class Requests {

    private Requests() {}

    /** Exactly two decimals, no sign, no exponent. The only money shape the service accepts. */
    public static final String AMOUNT_PATTERN = "^[0-9]{1,10}\\.[0-9]{2}$";
    private static final String PHONE_PATTERN = "^\\+?[0-9]{7,15}$";
    private static final String DATE_PATTERN = "^\\d{4}-\\d{2}-\\d{2}$";

    public record RegisterRequest(
            @NotBlank @Pattern(regexp = "^[^@\\s]+@[^@\\s]+\\.[^@\\s]{2,}$", message = "invalid e-mail")
            String email,
            @NotBlank @Size(min = 2, max = 80) String fullName,
            @NotBlank @Size(min = 10, max = 200) String password,
            @NotBlank @Pattern(regexp = "^[0-9]{4}$", message = "PIN must be 4 digits") String pin,
            @NotBlank @Pattern(regexp = PHONE_PATTERN, message = "invalid phone") String phone,
            @NotBlank @Pattern(regexp = DATE_PATTERN, message = "use yyyy-MM-dd") String dateOfBirth,
            @NotBlank @Pattern(regexp = "^[A-Z]{2}$", message = "use a 2-letter country code") String country,
            @NotBlank @Size(min = 3, max = 24) String documentType,
            @NotBlank @Size(max = 40) String documentNumber) {}

    public record LoginRequest(@NotBlank String email, @NotBlank String password) {}

    public record RefreshRequest(@NotBlank String refreshToken) {}

    public record OpenAccountRequest(@NotBlank @Pattern(regexp = "^[A-Z]{3}$") String currency) {}

    public record TransferRequest(
            @NotBlank String toEmail,
            @NotBlank @Pattern(regexp = "^[A-Z]{3}$") String currency,
            @NotBlank @Pattern(regexp = AMOUNT_PATTERN) String amount,
            @NotBlank @Pattern(regexp = "^[0-9]{4}$") String pin,
            @NotBlank @Size(max = 80) String idempotencyKey) {}

    public record FundsRequest(
            @NotBlank @Pattern(regexp = "^[A-Z]{3}$") String currency,
            @NotBlank @Pattern(regexp = AMOUNT_PATTERN) String amount,
            @NotBlank @Pattern(regexp = "^[0-9]{4}$") String pin,
            @NotBlank @Size(max = 80) String idempotencyKey) {}

    public record KycRequest(
            @NotBlank @Size(min = 3, max = 24) String documentType,
            @NotBlank @Size(max = 40) String documentNumber,
            @NotBlank @Pattern(regexp = PHONE_PATTERN, message = "invalid phone") String phone,
            @NotBlank @Pattern(regexp = DATE_PATTERN, message = "use yyyy-MM-dd") String dateOfBirth,
            @NotBlank @Pattern(regexp = "^[A-Z]{2}$", message = "use a 2-letter country code") String country) {}

    public record DecisionRequest(boolean approve) {}

    public record StatusRequest(@NotBlank @Size(max = 20) String status) {}

    public record FreezeRequest(boolean frozen) {}

    public record ChangePinRequest(
            @NotBlank @Pattern(regexp = "^[0-9]{4}$") String currentPin,
            @NotBlank @Pattern(regexp = "^[0-9]{4}$") String newPin) {}
}
