-- ============================================================
-- Migration 001: Voucher Approval Workflow
-- Additive and non-destructive. Extends the base ERP schema
-- defined in Mdb.sql.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------
-- 1. Add voucher status column
--    The base schema has no workflow status. Add it with a
--    safe default; existing rows become PENDING.
-- ----------------------------------------
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'PENDING';

UPDATE vouchers SET status = 'PENDING' WHERE status IS NULL OR status = '';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_vouchers_status') THEN
        ALTER TABLE vouchers ADD CONSTRAINT chk_vouchers_status
            CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED'));
    END IF;
END $$;

-- ----------------------------------------
-- 2. Voucher status history (audit trail)
--    A voucher may pass through several workflow states, so a
--    dedicated history table is preferred over approved_by /
--    rejected_by columns on vouchers.
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS voucher_status_history (
    history_id   BIGSERIAL PRIMARY KEY,
    voucher_id   INT          NOT NULL,
    old_status   VARCHAR(20)  NOT NULL CHECK (old_status IN ('PENDING', 'ACCEPTED', 'REJECTED')),
    new_status   VARCHAR(20)  NOT NULL CHECK (new_status IN ('PENDING', 'ACCEPTED', 'REJECTED')),
    remark       TEXT,
    changed_by   INT,
    changed_at   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_vsh_voucher FOREIGN KEY (voucher_id) REFERENCES vouchers(voucher_id) ON DELETE CASCADE,
    CONSTRAINT fk_vsh_user    FOREIGN KEY (changed_by) REFERENCES users(user_id)    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_vsh_voucher_id ON voucher_status_history(voucher_id);
CREATE INDEX IF NOT EXISTS idx_vsh_changed_at ON voucher_status_history(changed_at);

-- ----------------------------------------
-- 3. User company access (future-proofing)
--    The base schema stores a single users.company_id. This
--    mapping table allows a user to access several companies
--    later without restructuring the API. Existing users are
--    seeded from their primary company.
-- ----------------------------------------
CREATE TABLE IF NOT EXISTS user_companies (
    user_id    INT NOT NULL REFERENCES users(user_id)    ON DELETE CASCADE,
    company_id INT NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, company_id)
);

INSERT INTO user_companies (user_id, company_id)
SELECT user_id, company_id FROM users
ON CONFLICT DO NOTHING;

-- ----------------------------------------
-- 4. Query-driven indexes
--    - voucher list:   WHERE company_id AND status AND created_at range
--    - summary:        WHERE company_id AND created_at range
--    The composite (company_id, status, created_at) also serves
--    the (company_id, status) filter, so a separate
--    (company_id, status) index is not added.
-- ----------------------------------------
CREATE INDEX IF NOT EXISTS idx_vouchers_company_created ON vouchers (company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_vouchers_company_status_created ON vouchers (company_id, status, created_at);

-- ----------------------------------------
-- 5. Ensure lookup data exists (idempotent)
-- ----------------------------------------
INSERT INTO roles (role_name) VALUES ('Admin'), ('Accountant'), ('Viewer') ON CONFLICT DO NOTHING;
INSERT INTO user_levels (level_name) VALUES ('Level 1'), ('Level 2'), ('Level 3') ON CONFLICT DO NOTHING;
INSERT INTO access_types (type_name) VALUES ('Read-Only'), ('Read-Write'), ('Full-Control') ON CONFLICT DO NOTHING;

COMMIT;