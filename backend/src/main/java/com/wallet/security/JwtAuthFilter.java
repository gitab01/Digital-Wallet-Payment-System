package com.wallet.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Reads the bearer token and populates the security context. An absent or invalid
 * token is not rejected here: the request simply continues anonymously and the
 * authorisation rules in SecurityConfig decide whether that is allowed.
 */
@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private static final String BEARER = "Bearer ";

    private final TokenService tokens;

    public JwtAuthFilter(TokenService tokens) {
        this.tokens = tokens;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        if (SecurityContextHolder.getContext().getAuthentication() == null) {
            header(request).or(() -> queryParam(request))
                    .flatMap(tokens::verifyAccessToken)
                    .ifPresent(principal -> {
                        var authorities = principal.roles().stream()
                                .map(SimpleGrantedAuthority::new)
                                .toList();
                        var auth = new UsernamePasswordAuthenticationToken(principal, null, authorities);
                        SecurityContextHolder.getContext().setAuthentication(auth);
                    });
        }
        chain.doFilter(request, response);
    }

    private static java.util.Optional<String> header(HttpServletRequest request) {
        String value = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (value != null && value.startsWith(BEARER)) {
            return java.util.Optional.of(value.substring(BEARER.length()).trim());
        }
        return java.util.Optional.empty();
    }

    /**
     * Browser WebSocket handshakes cannot set headers, so the STOMP client passes
     * the token as a query parameter on /ws. Accepted only on that path, and never
     * logged, so a token cannot leak into an access log for the REST API.
     */
    private static java.util.Optional<String> queryParam(HttpServletRequest request) {
        if (!request.getRequestURI().startsWith("/ws")) return java.util.Optional.empty();
        String value = request.getParameter("access_token");
        return value == null || value.isBlank() ? java.util.Optional.empty() : java.util.Optional.of(value);
    }
}
