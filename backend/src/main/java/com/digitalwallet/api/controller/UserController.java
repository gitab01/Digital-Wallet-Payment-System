package com.digitalwallet.api.controller;

import com.digitalwallet.api.dto.response.ApiResponse;
import com.digitalwallet.api.dto.response.UserResponse;
import com.digitalwallet.api.entity.User;
import com.digitalwallet.api.exception.ResourceNotFoundException;
import com.digitalwallet.api.repository.UserRepository;
import com.digitalwallet.api.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/**
 * REST controller for user profile operations.
 */
@RestController
@RequestMapping("/users")
@RequiredArgsConstructor
public class UserController {

    private final UserRepository userRepository;

    /**
     * GET /api/users/me
     * Returns the authenticated user's profile.
     */
    @GetMapping("/me")
    public ResponseEntity<ApiResponse<UserResponse>> getCurrentUser(
        @AuthenticationPrincipal UserPrincipal principal
    ) {
        User user = userRepository.findById(principal.getId())
            .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        UserResponse response = UserResponse.builder()
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

        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
