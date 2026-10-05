package com.wallet.repository;

import com.wallet.domain.ReconciliationRun;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ReconciliationRunRepository extends JpaRepository<ReconciliationRun, Long> {

    List<ReconciliationRun> findByAccountIdOrderByRanAtDesc(Long accountId, Pageable pageable);

    List<ReconciliationRun> findByOutcomeOrderByRanAtDesc(ReconciliationRun.Outcome outcome, Pageable pageable);
}
