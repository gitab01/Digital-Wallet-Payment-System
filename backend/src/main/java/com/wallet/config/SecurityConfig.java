package com.wallet.config;

import com.wallet.security.JwtAuthFilter;
import com.wallet.security.RateLimitFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableConfigurationProperties(WalletProperties.class)
public class SecurityConfig {

    /**
     * BCrypt only: the password and the PIN are separate credentials, and neither is
     * ever recoverable, including by this service.
     */
    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    /**
     * These two filters belong inside the security chain, after the context has been
     * established by SecurityContextHolderFilter. Boot would also register any Filter
     * bean globally, which would run them a second time before the chain and lose the
     * authentication, so the implicit registrations are switched off explicitly.
     */
    @Bean
    FilterRegistrationBean<JwtAuthFilter> jwtFilterRegistrationDisabled(JwtAuthFilter filter) {
        FilterRegistrationBean<JwtAuthFilter> reg = new FilterRegistrationBean<>(filter);
        reg.setEnabled(false);
        return reg;
    }

    @Bean
    FilterRegistrationBean<RateLimitFilter> rateFilterRegistrationDisabled(RateLimitFilter filter) {
        FilterRegistrationBean<RateLimitFilter> reg = new FilterRegistrationBean<>(filter);
        reg.setEnabled(false);
        return reg;
    }

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http,
                                    JwtAuthFilter jwtAuthFilter,
                                    RateLimitFilter rateLimitFilter,
                                    @Value("${wallet.cors-allowed-origin-patterns:http://localhost:3000,http://127.0.0.1:3000,http://[::1]:3000}")
                                    List<String> allowedOrigins) throws Exception {
        http
            // The client is a separate origin holding tokens in memory or in web
            // storage, never cookies, so there is nothing for CSRF to defend.
            .csrf(AbstractHttpConfigurer::disable)
            .cors(cors -> cors.configurationSource(corsSource(allowedOrigins)))
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/auth/register", "/api/auth/login", "/api/auth/refresh",
                                 "/api/auth/logout", "/api/jwks", "/actuator/health", "/ws/**")
                    .permitAll()
                .requestMatchers("/api/kyc/*/decision", "/api/admin/**").hasRole("REVIEWER")
                .anyRequest().authenticated())
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint((req, res, e) -> writeError(res, HttpStatus.UNAUTHORIZED,
                        "AUTH_REQUIRED", "A valid access token is required."))
                .accessDeniedHandler((req, res, e) -> writeError(res, HttpStatus.FORBIDDEN,
                        "FORBIDDEN", "This session may not perform that action.")))
            // Token first so the limiter can key money rules on the subject rather
            // than on an address many users share.
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class)
            .addFilterAfter(rateLimitFilter, JwtAuthFilter.class);

        return http.build();
    }

    private CorsConfigurationSource corsSource(List<String> allowedOrigins) {
        CorsConfiguration config = new CorsConfiguration();
        // Set wallet.cors-allowed-origin-patterns to add a host: a phone on the LAN
        // opens the client at the machine's address, not at localhost. Credentials stay
        // off because Authorization is a header, never a cookie.
        config.setAllowedOriginPatterns(allowedOrigins);
        config.setAllowedMethods(List.of("GET", "POST", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type", "Idempotency-Key"));
        config.setExposedHeaders(List.of("Content-Disposition", "Retry-After"));
        config.setAllowCredentials(false);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }

    private static void writeError(jakarta.servlet.http.HttpServletResponse res,
                                   HttpStatus status, String code, String message) throws java.io.IOException {
        res.setStatus(status.value());
        res.setContentType("application/json;charset=UTF-8");
        res.getWriter().write("{\"code\":\"" + code + "\",\"message\":\"" + message + "\",\"details\":{}}");
    }
}
