package com.wallet.error;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.sql.SQLException;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Every failure leaves this one method as a typed error the client can branch on.
 * Nothing is translated ad hoc in a controller, and no stack trace or SQL text is
 * ever returned to a caller.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    /** SQL Server deadlock: transient, retried by the service, so a leak here is a bug. */
    private static final int DEADLOCK = 1205;

    @ExceptionHandler(ApiException.class)
    ResponseEntity<Map<String, Object>> handleApi(ApiException ex, HttpServletRequest req) {
        Map<String, Object> body = body(ex.getCode(), ex.getMessage(), ex.getDetails(), req);
        return ResponseEntity.status(ex.getStatus()).body(body);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex,
                                                         HttpServletRequest req) {
        Map<String, Object> fields = new LinkedHashMap<>();
        for (FieldError fe : ex.getBindingResult().getFieldErrors()) {
            fields.putIfAbsent(fe.getField(), fe.getDefaultMessage());
        }
        return ResponseEntity.badRequest()
                .body(body("VALIDATION_FAILED", "Request validation failed.", Map.of("fields", fields), req));
    }

    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    ResponseEntity<Map<String, Object>> handleStale(ObjectOptimisticLockingFailureException ex,
                                                   HttpServletRequest req) {
        log.warn("projection version conflict: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(body("CONCURRENT_UPDATE", "This wallet changed while the request was in flight.",
                        Map.of(), req));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<Map<String, Object>> handleIntegrity(DataIntegrityViolationException ex,
                                                       HttpServletRequest req) {
        Throwable root = ex.getMostSpecificCause();
        // A duplicate idempotency key surfacing here means two identical requests
        // raced past the pre-check; one insert wins and the loser is told to look up
        // the original rather than being shown a database error.
        if (root.getMessage() != null && root.getMessage().contains("uq_transfers_idempotency")) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(body("DUPLICATE_REQUEST", "A transfer with this idempotency key already exists.",
                            Map.of(), req));
        }
        log.error("rejected by a database constraint", root);
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(body("REJECTED_BY_LEDGER", "The ledger rejected this movement.", Map.of(), req));
    }

    @ExceptionHandler(SQLException.class)
    ResponseEntity<Map<String, Object>> handleSql(SQLException ex, HttpServletRequest req) {
        if (ex.getErrorCode() == DEADLOCK) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(body("CONCURRENT_UPDATE", "The wallet was busy; retry the transfer.", Map.of(), req));
        }
        log.error("unhandled SQL error {}", ex.getErrorCode(), ex);
        return ResponseEntity.internalServerError()
                .body(body("INTERNAL", "The service could not complete this request.", Map.of(), req));
    }

    /**
     * Money that cannot be parsed is a client mistake, not a server fault: "12.345" is
     * rejected rather than silently rounded, and this is where that rejection is given
     * its shape.
     */
    @ExceptionHandler({NumberFormatException.class, ArithmeticException.class, IllegalArgumentException.class})
    ResponseEntity<Map<String, Object>> handleAmount(RuntimeException ex, HttpServletRequest req) {
        log.debug("rejected malformed amount", ex);
        return ResponseEntity.badRequest()
                .body(body("INVALID_AMOUNT",
                        "Amounts must be a plain number with at most two decimals.", Map.of(), req));
    }

    /** A well-shaped but impossible date ("2001-02-30") only fails once it is parsed. */
    @ExceptionHandler(DateTimeParseException.class)
    ResponseEntity<Map<String, Object>> handleDate(DateTimeParseException ex, HttpServletRequest req) {
        log.debug("rejected malformed date", ex);
        return ResponseEntity.badRequest()
                .body(body("INVALID_DATE", "Dates must name a real day as yyyy-MM-dd.", Map.of(), req));
    }

    /**
     * Error numbers 50001 and up are the ledger guards in V2__ledger_invariants.sql.
     * A trigger firing is the system working, so it must not be reported as a defect;
     * the guard's own message names the invariant that stopped the movement.
     */
    @ExceptionHandler(org.springframework.dao.DataAccessException.class)
    ResponseEntity<Map<String, Object>> handleData(org.springframework.dao.DataAccessException ex,
                                                  HttpServletRequest req) {
        for (Throwable t = ex; t != null; t = t.getCause()) {
            if (!(t instanceof SQLException sql)) continue;
            if (sql.getErrorCode() == DEADLOCK) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(body("CONCURRENT_UPDATE",
                                "The wallet stayed busy through several attempts. Retry this transfer.",
                                Map.of(), req));
            }
            if (sql.getErrorCode() >= 50001 && sql.getErrorCode() <= 50099) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(body("REJECTED_BY_LEDGER", sql.getMessage(), Map.of(), req));
            }
        }
        log.error("unhandled data access failure", ex);
        return ResponseEntity.internalServerError()
                .body(body("INTERNAL", "The service could not complete this request.", Map.of(), req));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<Map<String, Object>> handleOther(Exception ex, HttpServletRequest req) {
        log.error("unhandled exception", ex);
        return ResponseEntity.internalServerError()
                .body(body("INTERNAL", "The service could not complete this request.", Map.of(), req));
    }

    private Map<String, Object> body(String code, String message, Map<String, Object> details,
                                     HttpServletRequest req) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("code", code);
        out.put("message", message);
        out.put("details", details);
        out.put("traceId", UUID.randomUUID().toString());
        out.put("path", req.getRequestURI());
        return out;
    }
}
