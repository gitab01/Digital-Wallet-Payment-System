package com.wallet.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Money paths use programmatic transactions instead of @Transactional.
 *
 * A bounded retry around a deadlocked transfer cannot live inside an annotation that
 * has already marked the call for rollback, and the transfer boundary deliberately
 * excludes the lockout counters and audit denials that must outlive it. Saying so with
 * an explicit template is what keeps that boundary visible to a reader.
 */
@Configuration
public class EngineConfig {

    @Bean
    TransactionTemplate transactionTemplate(PlatformTransactionManager manager) {
        return new TransactionTemplate(manager);
    }
}
