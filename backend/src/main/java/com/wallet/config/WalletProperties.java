package com.wallet.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Every tunable in one place, bound from application.yml. */
@ConfigurationProperties(prefix = "wallet")
public class WalletProperties {

    private final Jwt jwt = new Jwt();
    private final Pin pin = new Pin();
    private final Fees fees = new Fees();
    private final RateLimit rateLimit = new RateLimit();
    private final Anomaly anomaly = new Anomaly();
    private final Reconciliation reconciliation = new Reconciliation();
    private final Documents documents = new Documents();

    /** E-mail addresses allowed to approve KYC. Empty means no reviewer endpoint is usable. */
    private List<String> reviewers = new ArrayList<>();

    public Jwt getJwt() { return jwt; }
    public Pin getPin() { return pin; }
    public Fees getFees() { return fees; }
    public RateLimit getRateLimit() { return rateLimit; }
    public Anomaly getAnomaly() { return anomaly; }
    public Reconciliation getReconciliation() { return reconciliation; }
    public Documents getDocuments() { return documents; }
    public List<String> getReviewers() { return reviewers; }
    public void setReviewers(List<String> reviewers) { this.reviewers = reviewers; }

    public boolean isReviewer(String email) {
        return email != null && reviewers.stream().anyMatch(r -> r.equalsIgnoreCase(email.trim()));
    }

    public static class Jwt {
        private String issuer = "mela-wallet";
        private Duration accessTtl = Duration.ofMinutes(15);
        private Duration refreshTtl = Duration.ofDays(30);
        private String keyIdCurrent = "key-2";
        private String privateKeyCurrent;
        private String publicKeyCurrent;
        private String keyIdPrevious = "key-1";
        private String privateKeyPrevious;
        private String publicKeyPrevious;

        public String getIssuer() { return issuer; }
        public void setIssuer(String issuer) { this.issuer = issuer; }
        public Duration getAccessTtl() { return accessTtl; }
        public void setAccessTtl(Duration accessTtl) { this.accessTtl = accessTtl; }
        public Duration getRefreshTtl() { return refreshTtl; }
        public void setRefreshTtl(Duration refreshTtl) { this.refreshTtl = refreshTtl; }
        public String getKeyIdCurrent() { return keyIdCurrent; }
        public void setKeyIdCurrent(String keyIdCurrent) { this.keyIdCurrent = keyIdCurrent; }
        public String getPrivateKeyCurrent() { return privateKeyCurrent; }
        public void setPrivateKeyCurrent(String v) { this.privateKeyCurrent = v; }
        public String getPublicKeyCurrent() { return publicKeyCurrent; }
        public void setPublicKeyCurrent(String v) { this.publicKeyCurrent = v; }
        public String getKeyIdPrevious() { return keyIdPrevious; }
        public void setKeyIdPrevious(String keyIdPrevious) { this.keyIdPrevious = keyIdPrevious; }
        public String getPrivateKeyPrevious() { return privateKeyPrevious; }
        public void setPrivateKeyPrevious(String v) { this.privateKeyPrevious = v; }
        public String getPublicKeyPrevious() { return publicKeyPrevious; }
        public void setPublicKeyPrevious(String v) { this.publicKeyPrevious = v; }
    }

    public static class Pin {
        private int maxFailedAttempts = 5;
        private Duration lockout = Duration.ofMinutes(15);

        public int getMaxFailedAttempts() { return maxFailedAttempts; }
        public void setMaxFailedAttempts(int v) { this.maxFailedAttempts = v; }
        public Duration getLockout() { return lockout; }
        public void setLockout(Duration lockout) { this.lockout = lockout; }
    }

    public static class Fees {
        private int basisPoints = 100;
        /** Per-currency fixed floor, in cents. */
        private Map<String, Long> fixedCents = new HashMap<>();

        public int getBasisPoints() { return basisPoints; }
        public void setBasisPoints(int v) { this.basisPoints = v; }
        public Map<String, Long> getFixedCents() { return fixedCents; }
        public void setFixedCents(Map<String, Long> v) { this.fixedCents = v; }
        public long fixedFor(String currency) { return fixedCents.getOrDefault(currency, 0L); }
    }

    public static class RateLimit {
        private int loginPerMinute = 5;
        private int registerPerHour = 10;
        private int pinPerMinute = 6;
        private int transferPerMinute = 4;
        private int quotePerMinute = 30;
        private int generalPerMinute = 120;
        private int documentsPerMinute = 12;

        public int getLoginPerMinute() { return loginPerMinute; }
        public void setLoginPerMinute(int v) { this.loginPerMinute = v; }
        public int getRegisterPerHour() { return registerPerHour; }
        public void setRegisterPerHour(int v) { this.registerPerHour = v; }
        public int getPinPerMinute() { return pinPerMinute; }
        public void setPinPerMinute(int v) { this.pinPerMinute = v; }
        public int getTransferPerMinute() { return transferPerMinute; }
        public void setTransferPerMinute(int v) { this.transferPerMinute = v; }
        public int getQuotePerMinute() { return quotePerMinute; }
        public void setQuotePerMinute(int v) { this.quotePerMinute = v; }
        public int getGeneralPerMinute() { return generalPerMinute; }
        public void setGeneralPerMinute(int v) { this.generalPerMinute = v; }
        public int getDocumentsPerMinute() { return documentsPerMinute; }
        public void setDocumentsPerMinute(int v) { this.documentsPerMinute = v; }
    }

    public static class Anomaly {
        private double zThreshold = 3.0;
        private int minimumHistory = 8;
        private double amountWeight = 0.6;
        private double hourWeight = 0.25;
        private double newRecipientWeight = 0.15;

        public double getZThreshold() { return zThreshold; }
        public void setZThreshold(double v) { this.zThreshold = v; }
        public int getMinimumHistory() { return minimumHistory; }
        public void setMinimumHistory(int v) { this.minimumHistory = v; }
        public double getAmountWeight() { return amountWeight; }
        public void setAmountWeight(double v) { this.amountWeight = v; }
        public double getHourWeight() { return hourWeight; }
        public void setHourWeight(double v) { this.hourWeight = v; }
        public double getNewRecipientWeight() { return newRecipientWeight; }
        public void setNewRecipientWeight(double v) { this.newRecipientWeight = v; }
    }

    public static class Reconciliation {
        private String cron = "0 30 2 * * *";

        public String getCron() { return cron; }
        public void setCron(String cron) { this.cron = cron; }
    }

    /** Identity document scans. Bytes on disk, provenance in the database. */
    public static class Documents {
        private String storageDir = "./var/kyc-documents";
        private int maxBytes = 8 * 1024 * 1024;
        private int maxEdge = 1600;

        public String getStorageDir() { return storageDir; }
        public void setStorageDir(String v) { this.storageDir = v; }
        public int getMaxBytes() { return maxBytes; }
        public void setMaxBytes(int v) { this.maxBytes = v; }
        public int getMaxEdge() { return maxEdge; }
        public void setMaxEdge(int v) { this.maxEdge = v; }
    }
}
