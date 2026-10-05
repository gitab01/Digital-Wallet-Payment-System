package com.wallet.repository;

import com.wallet.domain.TierLimit;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TierLimitRepository extends JpaRepository<TierLimit, Integer> {
}
