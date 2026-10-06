-- Identity document images.
--
-- The scan itself never lives in the database: this table holds where the bytes are
-- on disk, how big they are, and a digest of their content. The digest is what makes
-- "the same photograph of an ID card has been filed by four different customers"
-- answerable with one lookup, which is the shape of an identity farm and the reason
-- a review desk has to see the images rather than only the document numbers.

CREATE TABLE kyc_documents (
    id            BIGINT IDENTITY(1,1) NOT NULL,
    kyc_record_id BIGINT       NOT NULL,
    side          NVARCHAR(8)  NOT NULL,
    storage_key   NVARCHAR(120) NOT NULL,
    byte_length   INT          NOT NULL,
    pixel_hash    CHAR(64)     NOT NULL,
    uploaded_at   DATETIME2(3) NOT NULL CONSTRAINT df_kycdoc_uploaded DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT pk_kyc_documents PRIMARY KEY (id),
    CONSTRAINT fk_kyc_documents_record FOREIGN KEY (kyc_record_id) REFERENCES kyc_records (id),
    CONSTRAINT ck_kyc_documents_side CHECK (side IN (N'FRONT', N'BACK')),
    -- One image per side per submission. Replacing a side updates this row in place
    -- rather than deleting and re-inserting it, so a reviewer who is looking at
    -- document 12 cannot be shown a different document by a concurrent re-upload.
    CONSTRAINT uq_kyc_documents_side UNIQUE (kyc_record_id, side),
    CONSTRAINT ck_kyc_documents_size CHECK (byte_length BETWEEN 1 AND 8388608)
);

CREATE INDEX ix_kyc_documents_record ON kyc_documents (kyc_record_id);
CREATE INDEX ix_kyc_documents_hash ON kyc_documents (pixel_hash);
GO

-- The runtime identity owns these rows: an upload replaces a side, and a suspended
-- account's submission can be re-uploaded after review. It still cannot touch the
-- ledger, which is the grant that matters.
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.kyc_documents TO wallet_runtime;
GRANT REFERENCES ON dbo.kyc_records TO wallet_runtime;
GO
