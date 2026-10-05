package com.wallet.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wallet.config.WalletProperties;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Refill;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Token buckets in front of the expensive surfaces: authentication, PIN-bearing
 * money calls, and the live quote endpoint. A stolen password is worth much less
 * when the rate at which it can be used is capped per address.
 *
 * In-process state is a deliberate trade-off for a single-instance deployment. A
 * multi-instance rollout moves these buckets to a shared store, which is why the
 * key is computed in exactly one place.
 */
@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private enum Rule { LOGIN, REGISTER, MONEY, QUOTE, GENERAL }

    private record Limit(int capacity, Duration period) {}

    private final WalletProperties props;
    private final ObjectMapper json;
    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    public RateLimitFilter(WalletProperties props, ObjectMapper json) {
        this.props = props;
        this.json = json;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        Rule rule = ruleFor(request);
        if (rule != null) {
            Limit limit = limitFor(rule);
            Bucket bucket = buckets.computeIfAbsent(key(request, rule), k -> newBucket(limit));
            if (!bucket.tryConsume(1)) {
                // Retry-After is the refill window: the earliest a rejected request
                // could legitimately be repeated.
                long retryAfter = limit.period().toSeconds();
                response.setHeader("Retry-After", String.valueOf(retryAfter));
                // Written here rather than thrown: an exception escaping a filter never
                // reaches @RestControllerAdvice, so the client would be handed the 401
                // from the authentication entry point instead of the 429 it earned.
                response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
                response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                response.setCharacterEncoding("UTF-8");
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("code", "RATE_LIMITED");
                body.put("message", "Too many requests.");
                body.put("details", Map.of("retryAfterSeconds", retryAfter));
                body.put("traceId", UUID.randomUUID().toString());
                body.put("path", request.getRequestURI());
                json.writeValue(response.getOutputStream(), body);
                return;
            }
            evictIfLarge();
        }
        chain.doFilter(request, response);
    }

    private Rule ruleFor(HttpServletRequest request) {
        String path = request.getRequestURI();
        boolean post = HttpMethod.POST.matches(request.getMethod());
        if (post && path.equals("/api/auth/login")) return Rule.LOGIN;
        if (post && path.equals("/api/auth/register")) return Rule.REGISTER;
        // Everything in these branches carries a PIN, so they share the strictest budget.
        if (post && (path.equals("/api/transfers") || path.startsWith("/api/funds/"))) return Rule.MONEY;
        if (path.equals("/api/transfers/quote")) return Rule.QUOTE;
        return SecurityUser.id() != null ? Rule.GENERAL : null;
    }

    private Limit limitFor(Rule rule) {
        var rl = props.getRateLimit();
        return switch (rule) {
            case LOGIN -> new Limit(rl.getLoginPerMinute(), Duration.ofMinutes(1));
            case REGISTER -> new Limit(rl.getRegisterPerHour(), Duration.ofHours(1));
            // The tighter of the transfer and PIN budgets governs money calls.
            case MONEY -> new Limit(Math.min(rl.getTransferPerMinute(), rl.getPinPerMinute()),
                    Duration.ofMinutes(1));
            case QUOTE -> new Limit(rl.getQuotePerMinute(), Duration.ofMinutes(1));
            case GENERAL -> new Limit(rl.getGeneralPerMinute(), Duration.ofMinutes(1));
        };
    }

    private static Bucket newBucket(Limit limit) {
        return Bucket.builder()
                .addLimit(Bandwidth.classic(limit.capacity(), Refill.greedy(limit.capacity(), limit.period())))
                .build();
    }

    /** Addresses for unauthenticated calls, subject ids for authenticated ones. */
    private String key(HttpServletRequest request, Rule rule) {
        String subject = switch (rule) {
            case LOGIN, REGISTER -> "ip:" + clientIp(request);
            case MONEY, QUOTE, GENERAL -> {
                String id = SecurityUser.id();
                yield id != null ? "u:" + id : "ip:" + clientIp(request);
            }
        };
        return rule + "|" + subject;
    }

    static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) return forwarded.split(",")[0].trim();
        return request.getRemoteAddr() == null ? "unknown" : request.getRemoteAddr();
    }

    /** Keeps the map bounded behind a NAT with many clients. */
    private void evictIfLarge() {
        if (buckets.size() > 50_000) buckets.clear();
    }
}
