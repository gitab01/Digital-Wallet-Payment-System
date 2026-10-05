package com.wallet.security;

import org.springframework.security.core.context.SecurityContextHolder;

/** The authenticated subject for the current request, or null. */
public final class SecurityUser {

    private SecurityUser() {}

    public static TokenService.AuthPrincipal principal() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.isAuthenticated()
                && auth.getPrincipal() instanceof TokenService.AuthPrincipal p) {
            return p;
        }
        return null;
    }

    public static String id() {
        TokenService.AuthPrincipal p = principal();
        return p == null ? null : String.valueOf(p.userId());
    }

    public static Long requiredId() {
        TokenService.AuthPrincipal p = principal();
        if (p == null) {
            throw com.wallet.error.ApiException.of(
                    org.springframework.http.HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "Sign in again.");
        }
        return p.userId();
    }
}
