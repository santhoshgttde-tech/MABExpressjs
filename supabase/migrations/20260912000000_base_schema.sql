-- PostgreSQL Database Dump
-- Schema: General Accounting & ERP System

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. COMPANIES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS companies (
    company_id SERIAL PRIMARY KEY,
    company_uuid UUID DEFAULT uuid_generate_v4() UNIQUE,
    company_name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- 2. ROLES & ACCESS CONTROL TABLES
-- ==========================================
CREATE TABLE IF NOT EXISTS roles (
    role_id SERIAL PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL UNIQUE -- e.g., 'Admin', 'Accountant', 'Viewer'
);

CREATE TABLE IF NOT EXISTS user_levels (
    level_id SERIAL PRIMARY KEY,
    level_name VARCHAR(50) NOT NULL UNIQUE -- e.g., 'L1', 'L2', 'Manager'
);

CREATE TABLE IF NOT EXISTS access_types (
    access_type_id SERIAL PRIMARY KEY,
    type_name VARCHAR(50) NOT NULL UNIQUE -- e.g., 'Read-Only', 'Read-Write', 'Full-Control'
);

-- ==========================================
-- 3. USERS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    user_uuid UUID DEFAULT uuid_generate_v4() UNIQUE,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    company_id INT NOT NULL,
    role_id INT NOT NULL,
    level_id INT NOT NULL,
    access_type_id INT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_users_company FOREIGN KEY (company_id) REFERENCES companies(company_id) ON DELETE RESTRICT,
    CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE RESTRICT,
    CONSTRAINT fk_users_level FOREIGN KEY (level_id) REFERENCES user_levels(level_id) ON DELETE RESTRICT,
    CONSTRAINT fk_users_access_type FOREIGN KEY (access_type_id) REFERENCES access_types(access_type_id) ON DELETE RESTRICT
);

-- Index for faster email logins
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ==========================================
-- 4. MASTER LEDGERS & STOCK ITEMS
-- ==========================================
CREATE TABLE IF NOT EXISTS ledgers (
    ledger_id SERIAL PRIMARY KEY,
    company_id INT NOT NULL,
    ledger_name VARCHAR(255) NOT NULL,
    CONSTRAINT fk_ledgers_company FOREIGN KEY (company_id) REFERENCES companies(company_id) ON DELETE CASCADE,
    CONSTRAINT uq_company_ledger UNIQUE (company_id, ledger_name)
);

CREATE TABLE IF NOT EXISTS stock_items (
    stock_item_id SERIAL PRIMARY KEY,
    company_id INT NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    CONSTRAINT fk_stock_items_company FOREIGN KEY (company_id) REFERENCES companies(company_id) ON DELETE CASCADE,
    CONSTRAINT uq_company_item UNIQUE (company_id, item_name)
);

-- ==========================================
-- 5. VOUCHERS TABLE (Header)
-- ==========================================
CREATE TABLE IF NOT EXISTS vouchers (
    voucher_id SERIAL PRIMARY KEY,
    voucher_uuid UUID DEFAULT uuid_generate_v4() UNIQUE,
    company_id INT NOT NULL,
    voucher_number VARCHAR(100) NOT NULL,
    voucher_type VARCHAR(50) NOT NULL, -- e.g., 'Sales', 'Purchase', 'Payment'
    party_ledger_id INT NOT NULL,
    bill_to_address TEXT,
    ship_to_address TEXT,
    place_of_supply VARCHAR(150),
    cost_center VARCHAR(150),
    total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
    narration TEXT,
    remark TEXT,
    created_by INT REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_vouchers_company FOREIGN KEY (company_id) REFERENCES companies(company_id) ON DELETE CASCADE,
    CONSTRAINT fk_vouchers_party_ledger FOREIGN KEY (party_ledger_id) REFERENCES ledgers(ledger_id) ON DELETE RESTRICT,
    CONSTRAINT uq_company_voucher_num UNIQUE (company_id, voucher_number)
);

CREATE INDEX IF NOT EXISTS idx_vouchers_company_id ON vouchers(company_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_type ON vouchers(voucher_type);

-- ==========================================
-- 6. INVENTORY ENTRIES TABLE (Detail)
-- ==========================================
CREATE TABLE IF NOT EXISTS inventory_entries (
    entry_id SERIAL PRIMARY KEY,
    voucher_id INT NOT NULL,
    stock_item_id INT NOT NULL,
    qty NUMERIC(12, 4) NOT NULL CHECK (qty > 0),
    rate NUMERIC(15, 2) NOT NULL CHECK (rate >= 0),
    inclusive_rate NUMERIC(15, 2) CHECK (inclusive_rate >= 0),
    discount_percentage NUMERIC(5, 2) DEFAULT 0.00 CHECK (discount_percentage >= 0 AND discount_percentage <= 100),
    amount NUMERIC(15, 2) NOT NULL CHECK (amount >= 0),
    CONSTRAINT fk_inventory_voucher FOREIGN KEY (voucher_id) REFERENCES vouchers(voucher_id) ON DELETE CASCADE,
    CONSTRAINT fk_inventory_stock_item FOREIGN KEY (stock_item_id) REFERENCES stock_items(stock_item_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_inventory_voucher_id ON inventory_entries(voucher_id);

-- ==========================================
-- 7. LEDGER ENTRIES TABLE (Detail)
-- ==========================================
CREATE TABLE IF NOT EXISTS ledger_entries (
    entry_id SERIAL PRIMARY KEY,
    voucher_id INT NOT NULL,
    ledger_id INT NOT NULL,
    amount NUMERIC(15, 2) NOT NULL, -- Positive for Debit, Negative for Credit (or vice versa)
    entry_type VARCHAR(2) CHECK (entry_type IN ('DR', 'CR')),
    CONSTRAINT fk_ledger_entries_voucher FOREIGN KEY (voucher_id) REFERENCES vouchers(voucher_id) ON DELETE CASCADE,
    CONSTRAINT fk_ledger_entries_ledger FOREIGN KEY (ledger_id) REFERENCES ledgers(ledger_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_voucher_id ON ledger_entries(voucher_id);

-- ==========================================
-- SEED BASIC LOOKUP DATA
-- ==========================================
INSERT INTO roles (role_name) VALUES ('Admin'), ('Accountant'), ('Viewer') ON CONFLICT DO NOTHING;
INSERT INTO user_levels (level_name) VALUES ('Level 1'), ('Level 2'), ('Level 3') ON CONFLICT DO NOTHING;
INSERT INTO access_types (type_name) VALUES ('Read-Only'), ('Read-Write'), ('Full-Control') ON CONFLICT DO NOTHING;

COMMIT;