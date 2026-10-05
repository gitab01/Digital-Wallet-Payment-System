package com.wallet.config;

import com.wallet.error.ApiException;
import com.wallet.security.TokenService;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.server.support.DefaultHandshakeHandler;

import java.util.List;

/**
 * Realtime balance push transport.
 *
 * The socket is authenticated on the STOMP CONNECT frame rather than on the HTTP
 * handshake, because the client library carries the token in a frame header the REST
 * client already uses. The authenticated principal's name is the user id, which is
 * what makes /user/queue/* addressable per customer and what makes it impossible to
 * subscribe to another customer's money.
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final TokenService tokens;

    public WebSocketConfig(TokenService tokens) {
        this.tokens = tokens;
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns("*")
                .setHandshakeHandler(new DefaultHandshakeHandler());
        // Any origin may open a socket, but no unauthenticated socket survives the
        // CONNECT check below. That is the difference between an open door and an
        // open port.
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/queue", "/topic");
        registry.setApplicationDestinationPrefixes("/app");
        registry.setUserDestinationPrefix("/user");
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(new ChannelInterceptor() {
            @Override
            public Message<?> preSend(Message<?> message, MessageChannel channel) {
                StompHeaderAccessor accessor =
                        MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
                if (accessor == null || StompCommand.CONNECT != accessor.getCommand()) return message;

                String raw = accessor.getFirstNativeHeader("Authorization");
                if (raw != null && raw.startsWith("Bearer ")) raw = raw.substring(7).trim();
                if (raw == null || raw.isBlank()) raw = accessor.getFirstNativeHeader("token");

                final String token = raw;
                TokenService.AuthPrincipal principal = token == null || token.isBlank()
                        ? null
                        : tokens.verifyAccessToken(token).orElse(null);
                if (principal == null) {
                    throw ApiException.of(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED",
                            "This socket needs a valid access token.");
                }

                List<SimpleGrantedAuthority> authorities = principal.roles().stream()
                        .map(SimpleGrantedAuthority::new)
                        .toList();
                accessor.setUser(new UsernamePasswordAuthenticationToken(
                        String.valueOf(principal.userId()), null, authorities));
                return message;
            }
        });
    }
}
