package com.digitalwallet.api.dto.response;

import com.digitalwallet.api.entity.User;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * Response payload representing a user's public profile.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserResponse {

    private Long id;
    private String firstName;
    private String lastName;
    private String email;
    private String phoneNumber;
    private User.UserRole role;
    private User.UserStatus status;
    private Boolean isEmailVerified;
    private Boolean isTwoFactorEnabled;
    private LocalDateTime createdAt;
}
