package com.digitalwallet.api.service;

import com.digitalwallet.api.dto.request.LoginRequest;
import com.digitalwallet.api.dto.request.RegisterRequest;
import com.digitalwallet.api.dto.response.AuthResponse;

/**
 * Defines authentication operations for the Digital Wallet platform.
 */
public interface AuthService {

    /**
     * Registers a new user and creates their initial wallet.
     *
     * @param request registration details
     * @return JWT tokens and user profile
     */
    AuthResponse register(RegisterRequest request);

    /**
     * Authenticates an existing user and returns JWT tokens.
     *
     * @param request login credentials
     * @return JWT tokens and user profile
     */
    AuthResponse login(LoginRequest request);

    /**
     * Rotates a refresh token and issues a new access token.
     *
     * @param refreshToken the current valid refresh token
     * @return new JWT tokens
     */
    AuthResponse refreshToken(String refreshToken);

    /**
     * Revokes the user's refresh token, effectively logging them out.
     *
     * @param refreshToken the token to revoke
     */
    void logout(String refreshToken);
}
