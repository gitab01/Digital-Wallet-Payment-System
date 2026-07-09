package com.digitalwallet.api.service.impl;

import com.digitalwallet.api.dto.request.CreateWalletRequest;
import com.digitalwallet.api.dto.request.LoginRequest;
import com.digitalwallet.api.dto.request.RegisterRequest;
import com.digitalwallet.api.dto.response.AuthResponse;
import com.digitalwallet.api.dto.response.UserResponse;
import com.digitalwallet.api.entity.RefreshToken;
import com.digitalwallet.api.entity.User;
import com.digitalwallet.api.exception.AuthenticationException;
import com.digitalwallet.api.exception.DuplicateResourceException;
import com.digitalwallet.api.exception.ResourceNotFoundException;
import com.digitalwallet.api.repository.RefreshTokenRepository;
import com.digitalwallet.api.repository.UserRepository;
import com.digitalwallet.api.security.JwtTokenProvider;
import com.digitalwallet.api.service.AuthService;
import com.digitalwallet.api.service.WalletService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

/**
 * Implements authentication and token management operations.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AuthServiceImpl implements AuthService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final WalletService walletService;
    private final AuthenticationManager authenticationManager;
    private final JwtTokenProvider jwtTokenProvider;
    private final PasswordEncoder passwordEncoder;

    @Value("${jwt.refresh-expiration}")
    private long refreshTokenExpiration;

    @Value("${jwt.expiration}")
    private long jwtExpiration;

    @Override
    @Transactional
    public AuthResponse register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new DuplicateResourceException("Email is already registered");
        }
        if (request.getPhoneNumber() != null &&
            userRepository.existsByPhoneNumber(request.getPhoneNumber())) {
            throw new DuplicateResourceException("Phone number is already registered");
        }

        User user = User.builder()
            .firstName(request.getFirstName())
            .lastName(request.getLastName())
            .email(request.getEmail())
            .passwordHash(passwordEncoder.encode(request.getPassword()))
            .phoneNumber(request.getPhoneNumber())
            .build();

        User savedUser = userRepository.save(user);
        log.info("Registered new user with ID: {}", savedUser.getId());

        // Create the user's initial default wallet
        CreateWalletRequest walletRequest = new CreateWalletRequest();
        walletRequest.setCurrencyCode(request.getInitialCurrency().toUpperCase());
        walletRequest.setSetAsDefault(true);
        walletService.createWallet(savedUser.getId(), walletRequest);

        String accessToken = jwtTokenProvider.generateToken(savedUser.getEmail());
        String refreshToken = createAndSaveRefreshToken(savedUser);

        return buildAuthResponse(accessToken, refreshToken, savedUser);
    }

    @Override
    @Transactional
    public AuthResponse login(LoginRequest request) {
        try {
            Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.getEmail(), request.getPassword())
            );

            User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

            String accessToken = jwtTokenProvider.generateToken(authentication);
            String refreshToken = createAndSaveRefreshToken(user);

            log.info("User {} logged in successfully", user.getEmail());
            return buildAuthResponse(accessToken, refreshToken, user);

        } catch (BadCredentialsException e) {
            throw new AuthenticationException("Invalid email or password");
        }
    }

    @Override
    @Transactional
    public AuthResponse refreshToken(String refreshToken) {
        RefreshToken token = refreshTokenRepository.findByToken(refreshToken)
            .orElseThrow(() -> new AuthenticationException("Invalid refresh token"));

        if (token.getIsRevoked() || token.getExpiryDate().isBefore(Instant.now())) {
            throw new AuthenticationException("Refresh token is expired or revoked");
        }

        // Rotate the refresh token
        token.setIsRevoked(true);
        refreshTokenRepository.save(token);

        User user = token.getUser();
        String newAccessToken = jwtTokenProvider.generateToken(user.getEmail());
        String newRefreshToken = createAndSaveRefreshToken(user);

        return buildAuthResponse(newAccessToken, newRefreshToken, user);
    }

    @Override
    @Transactional
    public void logout(String refreshToken) {
        refreshTokenRepository.findByToken(refreshToken)
            .ifPresent(token -> {
                token.setIsRevoked(true);
                refreshTokenRepository.save(token);
            });
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private String createAndSaveRefreshToken(User user) {
        // Invalidate any existing refresh token
        refreshTokenRepository.findByUser(user)
            .ifPresent(existing -> {
                existing.setIsRevoked(true);
                refreshTokenRepository.save(existing);
            });

        RefreshToken refreshToken = RefreshToken.builder()
            .user(user)
            .token(UUID.randomUUID().toString())
            .expiryDate(Instant.now().plusMillis(refreshTokenExpiration))
            .build();

        return refreshTokenRepository.save(refreshToken).getToken();
    }

    private AuthResponse buildAuthResponse(String accessToken, String refreshToken, User user) {
        UserResponse userResponse = UserResponse.builder()
            .id(user.getId())
            .firstName(user.getFirstName())
            .lastName(user.getLastName())
            .email(user.getEmail())
            .phoneNumber(user.getPhoneNumber())
            .role(user.getRole())
            .status(user.getStatus())
            .isEmailVerified(user.getIsEmailVerified())
            .isTwoFactorEnabled(user.getIsTwoFactorEnabled())
            .createdAt(user.getCreatedAt())
            .build();

        return AuthResponse.builder()
            .accessToken(accessToken)
            .refreshToken(refreshToken)
            .tokenType("Bearer")
            .expiresIn(jwtExpiration / 1000)
            .user(userResponse)
            .build();
    }
}
