-- ============================================================================
-- Seed: Deterministic Test Data for the ERP Voucher Approval System
-- Target:  Supabase PostgreSQL development database (dev/test only)
--
-- Files:
--   database/seed/seed_test_data.sql     - this file (idempotent seed)
--   database/seed/clear_test_data.sql    - removes every seeded row
--   scripts/seed.js                      - runner: `npm run seed` / `npm run seed:clear`
--
-- Scope / safety:
--   * Operates ONLY on the two test companies created here and on accounts
--     using emails ending in "@testerp.com". Existing production data is
--     never touched.
--   * Re-runnable: prior seed rows for the test companies are deleted first,
--     then re-created, all inside one transaction (all-or-nothing).
--   * Deterministic: voucher numbers (TEST-*), persons, amounts, remarks and
--     created_at times are fixed, so API/Flutter debugging is reproducible.
--
-- Distances of `created_at` from today (Asia/Kolkata), per company:
--   Day 0 (today):  25 PENDING, 15 ACCEPTED,  5 REJECTED  (dashboard demo)
--   Day 1:           5 PENDING,  5 ACCEPTED,  4 REJECTED
--   Day 2:           5 PENDING,  3 ACCEPTED,  3 REJECTED
--   Day 3:           4 PENDING,  2 ACCEPTED,  3 REJECTED
--   Day 4:           3 PENDING,  2 ACCEPTED,  2 REJECTED
--   Day 5:           2 PENDING,  1 ACCEPTED,  1 REJECTED
--   Day 6:           2 PENDING,  1 ACCEPTED,  1 REJECTED
--   Day 7:           2 PENDING,  1 ACCEPTED,  1 REJECTED
--   Day 8:           1 PENDING,  0 ACCEPTED,  0 REJECTED
--   Day 9:           1 PENDING,  0 ACCEPTED,  0 REJECTED
--   -------------------------------------------------------------
--   Total / company: 50 PENDING, 30 ACCEPTED, 20 REJECTED = 100 vouchers
--   Both companies:  100 vouchers each = 200 vouchers
--
-- Password: ALL seeded users share the password  Test@12345
--   password_hash is a bcrypt hash (cost 10, bcryptjs) of "Test@12345":
--     $2a$10$sKtEdFcfMYGh4wX3e9mW9eqERrOPAXRnNDwgUpbUL5AUfc60ehKU2
--   generated with the same library used by src/services/auth.service.js:
--     node -e "const b=require('bcryptjs');console.log(b.hashSync('Test@12345',10))"
--   Do NOT replace it with a plaintext password.
--
-- Ledger consistency is preserved: for every voucher the sum of DR ledger
-- entries equals the sum of CR ledger entries and equals total_amount.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Session temp table used to build inventory lines before we have the
--    voucher_id (kept inside the seeded transaction, dropped at logout).
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE IF NOT EXISTS tmp_seed_lines (
    stock_item_id       INT,
    qty                 NUMERIC(12,4),
    rate                NUMERIC(15,2),
    inclusive_rate      NUMERIC(15,2),
    discount_percentage NUMERIC(5,2),
    amount              NUMERIC(15,2)
) ON COMMIT DROP;

-- ---------------------------------------------------------------------------
-- 1. Test companies (explicit, stable ids 1 and 2)
-- ---------------------------------------------------------------------------
INSERT INTO companies (company_id, company_name)
VALUES (1, 'ABC Enterprises Pvt Ltd'),
       (2, 'XYZ Trading & Distribution Pvt Ltd')
ON CONFLICT (company_id) DO UPDATE SET company_name = EXCLUDED.company_name;

SELECT setval(pg_get_serial_sequence('companies', 'company_id'),
              GREATEST((SELECT COALESCE(MAX(company_id), 0) FROM companies), 2));

-- ---------------------------------------------------------------------------
-- 2. Clear prior seed rows belonging to the test companies and test users
--    (makes the seed idempotent). Cascades clear inventory/ledger/history.
-- ---------------------------------------------------------------------------
DELETE FROM voucher_status_history
 WHERE voucher_id IN (SELECT voucher_id FROM vouchers WHERE company_id IN (1, 2));

DELETE FROM vouchers WHERE company_id IN (1, 2);
DELETE FROM ledgers     WHERE company_id IN (1, 2);
DELETE FROM stock_items WHERE company_id IN (1, 2);

DELETE FROM user_companies
 WHERE user_id IN (SELECT user_id FROM users WHERE email LIKE '%@testerp.com');

-- ---------------------------------------------------------------------------
-- 3. Ledger masters (25 per company, no duplicates within a company)
-- ---------------------------------------------------------------------------
INSERT INTO ledgers (company_id, ledger_name) VALUES
    (1, 'Cash'),                     (1, 'Bank Account'),
    (1, 'Sales'),                    (1, 'Purchase'),
    (1, 'Sales Returns'),            (1, 'Purchase Returns'),
    (1, 'GST Output'),               (1, 'GST Input'),
    (1, 'Discount'),                 (1, 'Freight Charges'),
    (1, 'Salary Payable'),           (1, 'Rent Expense'),
    (1, 'Office Expenses'),          (1, 'Interest Expense'),
    (1, 'Commission Received'),      (1, 'Outstanding Expenses'),
    -- ABC customers (Sales / Receipt / Credit Note parties)
    (1, 'ABC Traders'),              (1, 'XYZ Enterprises'),
    (1, 'Manish & Co'),              (1, 'S.K. Marketers'),
    (1, 'Jain Brothers'),
    -- ABC suppliers (Purchase / Payment / Debit Note parties)
    (1, 'Premier Products'),         (1, 'Global Traders'),
    (1, 'Sunrise Suppliers'),        (1, 'Metro Goods'),

    (2, 'Cash'),                     (2, 'Bank Account'),
    (2, 'Sales'),                    (2, 'Purchase'),
    (2, 'Sales Returns'),            (2, 'Purchase Returns'),
    (2, 'GST Output'),               (2, 'GST Input'),
    (2, 'Discount'),                 (2, 'Freight Charges'),
    (2, 'Salary Payable'),           (2, 'Rent Expense'),
    (2, 'Office Expenses'),          (2, 'Interest Expense'),
    (2, 'Commission Received'),      (2, 'Outstanding Expenses'),
    -- XYZ customers
    (2, 'XYZ Technologies'),         (2, 'Sunrise Industries'),
    (2, 'Global Supply Co'),         (2, 'Premier Traders'),
    (2, 'Ashoka Distributors'),
    -- XYZ suppliers
    (2, 'National Suppliers'),       (2, 'Eastern Goods'),
    (2, 'Crystal Impex'),            (2, 'Sai Traders');

-- ---------------------------------------------------------------------------
-- 4. Stock items (16 per company)
-- ---------------------------------------------------------------------------
INSERT INTO stock_items (company_id, item_name) VALUES
    (1, 'Laptop'),               (1, 'Desktop Computer'),
    (1, 'Monitor'),              (1, 'Keyboard'),
    (1, 'Mouse'),                (1, 'Printer'),
    (1, 'Router'),               (1, 'Network Switch'),
    (1, 'USB Cable'),            (1, 'HDMI Cable'),
    (1, 'Office Chair'),         (1, 'Office Table'),
    (1, 'UPS'),                  (1, 'Barcode Scanner'),
    (1, 'Thermal Printer'),      (1, 'External Hard Drive'),

    (2, 'Laptop'),               (2, 'Desktop Computer'),
    (2, 'Monitor'),              (2, 'Keyboard'),
    (2, 'Mouse'),                (2, 'Printer'),
    (2, 'Router'),               (2, 'Network Switch'),
    (2, 'USB Cable'),            (2, 'HDMI Cable'),
    (2, 'Office Chair'),         (2, 'Office Table'),
    (2, 'UPS'),                  (2, 'Barcode Scanner'),
    (2, 'Thermal Printer'),      (2, 'External Hard Drive');

-- ---------------------------------------------------------------------------
-- 5. Test users (accounts only; password for all is Test@12345)
--    Admin -> Level 3 / Full-Control
--    Accountant -> Level 2 / Read-Write (ABC) or Full-Control (XYZ)
--    Viewer -> Level 1 / Read-Only
-- ---------------------------------------------------------------------------
INSERT INTO users (full_name, email, password_hash, company_id, role_id, level_id, access_type_id, is_active)
SELECT 'Test Admin', 'admin@testerp.com', '$2a$10$sKtEdFcfMYGh4wX3e9mW9eqERrOPAXRnNDwgUpbUL5AUfc60ehKU2',
       1, r.role_id, l.level_id, a.access_type_id, TRUE
  FROM roles r, user_levels l, access_types a
 WHERE r.role_name = 'Admin' AND l.level_name = 'Level 3' AND a.type_name = 'Full-Control'
ON CONFLICT (email) DO UPDATE SET
    full_name = EXCLUDED.full_name, password_hash = EXCLUDED.password_hash,
    company_id = EXCLUDED.company_id, role_id = EXCLUDED.role_id,
    level_id = EXCLUDED.level_id, access_type_id = EXCLUDED.access_type_id,
    is_active = EXCLUDED.is_active;

INSERT INTO users (full_name, email, password_hash, company_id, role_id, level_id, access_type_id, is_active)
SELECT 'Test Accountant', 'accountant@testerp.com', '$2a$10$sKtEdFcfMYGh4wX3e9mW9eqERrOPAXRnNDwgUpbUL5AUfc60ehKU2',
       1, r.role_id, l.level_id, a.access_type_id, TRUE
  FROM roles r, user_levels l, access_types a
 WHERE r.role_name = 'Accountant' AND l.level_name = 'Level 2' AND a.type_name = 'Read-Write'
ON CONFLICT (email) DO UPDATE SET
    full_name = EXCLUDED.full_name, password_hash = EXCLUDED.password_hash,
    company_id = EXCLUDED.company_id, role_id = EXCLUDED.role_id,
    level_id = EXCLUDED.level_id, access_type_id = EXCLUDED.access_type_id,
    is_active = EXCLUDED.is_active;

INSERT INTO users (full_name, email, password_hash, company_id, role_id, level_id, access_type_id, is_active)
SELECT 'Test Viewer', 'viewer@testerp.com', '$2a$10$sKtEdFcfMYGh4wX3e9mW9eqERrOPAXRnNDwgUpbUL5AUfc60ehKU2',
       1, r.role_id, l.level_id, a.access_type_id, TRUE
  FROM roles r, user_levels l, access_types a
 WHERE r.role_name = 'Viewer' AND l.level_name = 'Level 1' AND a.type_name = 'Read-Only'
ON CONFLICT (email) DO UPDATE SET
    full_name = EXCLUDED.full_name, password_hash = EXCLUDED.password_hash,
    company_id = EXCLUDED.company_id, role_id = EXCLUDED.role_id,
    level_id = EXCLUDED.level_id, access_type_id = EXCLUDED.access_type_id,
    is_active = EXCLUDED.is_active;

INSERT INTO users (full_name, email, password_hash, company_id, role_id, level_id, access_type_id, is_active)
SELECT 'XYZ Admin', 'xyz-admin@testerp.com', '$2a$10$sKtEdFcfMYGh4wX3e9mW9eqERrOPAXRnNDwgUpbUL5AUfc60ehKU2',
       2, r.role_id, l.level_id, a.access_type_id, TRUE
  FROM roles r, user_levels l, access_types a
 WHERE r.role_name = 'Admin' AND l.level_name = 'Level 3' AND a.type_name = 'Full-Control'
ON CONFLICT (email) DO UPDATE SET
    full_name = EXCLUDED.full_name, password_hash = EXCLUDED.password_hash,
    company_id = EXCLUDED.company_id, role_id = EXCLUDED.role_id,
    level_id = EXCLUDED.level_id, access_type_id = EXCLUDED.access_type_id,
    is_active = EXCLUDED.is_active;

INSERT INTO users (full_name, email, password_hash, company_id, role_id, level_id, access_type_id, is_active)
SELECT 'XYZ Accountant', 'xyz-accountant@testerp.com', '$2a$10$sKtEdFcfMYGh4wX3e9mW9eqERrOPAXRnNDwgUpbUL5AUfc60ehKU2',
       2, r.role_id, l.level_id, a.access_type_id, TRUE
  FROM roles r, user_levels l, access_types a
 WHERE r.role_name = 'Accountant' AND l.level_name = 'Level 2' AND a.type_name = 'Full-Control'
ON CONFLICT (email) DO UPDATE SET
    full_name = EXCLUDED.full_name, password_hash = EXCLUDED.password_hash,
    company_id = EXCLUDED.company_id, role_id = EXCLUDED.role_id,
    level_id = EXCLUDED.level_id, access_type_id = EXCLUDED.access_type_id,
    is_active = EXCLUDED.is_active;

INSERT INTO users (full_name, email, password_hash, company_id, role_id, level_id, access_type_id, is_active)
SELECT 'XYZ Viewer', 'xyz-viewer@testerp.com', '$2a$10$sKtEdFcfMYGh4wX3e9mW9eqERrOPAXRnNDwgUpbUL5AUfc60ehKU2',
       2, r.role_id, l.level_id, a.access_type_id, TRUE
  FROM roles r, user_levels l, access_types a
 WHERE r.role_name = 'Viewer' AND l.level_name = 'Level 1' AND a.type_name = 'Read-Only'
ON CONFLICT (email) DO UPDATE SET
    full_name = EXCLUDED.full_name, password_hash = EXCLUDED.password_hash,
    company_id = EXCLUDED.company_id, role_id = EXCLUDED.role_id,
    level_id = EXCLUDED.level_id, access_type_id = EXCLUDED.access_type_id,
    is_active = EXCLUDED.is_active;

-- Test Admin can access BOTH companies (secondary company via user_companies).
-- Every other test account is limited to its primary company.
INSERT INTO user_companies (user_id, company_id)
SELECT u.user_id, 2 FROM users u WHERE u.email = 'admin@testerp.com'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Vouchers, inventory entries, ledger entries and approval history
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    -- global voucher counter (shared by both companies -> stable numbering)
    g               INT := 0;
    cid             INT;
    st              TEXT;
    v_cnt           INT;
    k               INT;
    d               INT;
    li              INT;
    -- admin / approver of the current company
    v_admin_id      INT;
    v_approver_id   INT;
    -- ledger ids for the current company
    v_sales         INT;
    v_purchase      INT;
    v_gst_out       INT;
    v_gst_in        INT;
    v_cash          INT;
    v_bank          INT;
    v_sret          INT;
    v_pret          INT;
    v_int           INT;
    -- per-day status counts (index 1 -> day 0, ..., 10 -> day 9)
    day_p           INT[] := ARRAY[25,5,5,4,3,2,2,2,1,1];
    day_a           INT[] := ARRAY[15,5,3,2,2,1,1,1,0,0];
    day_r           INT[] := ARRAY[5,4,3,3,2,1,1,1,0,0];
    -- voucher type cycle (21 entries; 57% Sales/Purchase as required)
    v_cycle         TEXT[] := ARRAY[
        'Sales','Sales','Sales','Sales','Sales','Sales',
        'Purchase','Purchase','Purchase','Purchase','Purchase','Purchase',
        'Receipt','Receipt','Receipt','Payment','Payment','Payment',
        'Journal','Debit Note','Credit Note'];
    v_abbr_cycle    TEXT[] := ARRAY[
        'SAL','SAL','SAL','SAL','SAL','SAL',
        'PUR','PUR','PUR','PUR','PUR','PUR',
        'REC','REC','REC','PAY','PAY','PAY',
        'JRN','DN','CN'];
    v_abbr_all      TEXT[] := ARRAY['SAL','PUR','REC','PAY','JRN','DN','CN'];
    ctr             INT[] := ARRAY[0,0,0,0,0,0,0];
    pos             INT;
    -- party names per company
    customers_1     TEXT[] := ARRAY['ABC Traders','XYZ Enterprises','Manish & Co','S.K. Marketers','Jain Brothers'];
    suppliers_1     TEXT[] := ARRAY['Premier Products','Global Traders','Sunrise Suppliers','Metro Goods'];
    customers_2     TEXT[] := ARRAY['XYZ Technologies','Sunrise Industries','Global Supply Co','Premier Traders','Ashoka Distributors'];
    suppliers_2     TEXT[] := ARRAY['National Suppliers','Eastern Goods','Crystal Impex','Sai Traders'];
    v_party         TEXT;
    v_party_id      INT;
    -- stock master (16 items in insert order -> ids 1..16 within company)
    v_item_ids      INT[];
    v_rates         NUMERIC[] := ARRAY[45000,32000,9500,1200,850,8500,3200,6500,150,250,4500,8500,4200,3800,5500,4800];
    v_discs         NUMERIC[] := ARRAY[0,5,2,10,8,3,0,7,5,10,4,6,0,9,5,0];
    v_line_item     INT;
    v_qty           NUMERIC;
    v_rate          NUMERIC;
    v_disc          NUMERIC;
    v_line_amt      NUMERIC;
    v_taxable       NUMERIC;
    v_gst_rate      NUMERIC;
    v_gst           NUMERIC;
    v_total         NUMERIC;
    v_amounts       NUMERIC[] := ARRAY[1250,4500,8750,12500,25000,48500,75000,125000];
    -- voucher fields
    v_type          TEXT;
    v_abbr          TEXT;
    v_code          TEXT;
    v_status        TEXT;
    v_remark        TEXT;
    v_created_at    TIMESTAMPTZ;
    v_day_start     TIMESTAMP;
    v_off           INT;
    v_vid           INT;
    v_narr          TEXT;
    acc_remarks     TEXT[] := ARRAY['Verified and approved.','Invoice checked and approved.','Documents verified.','Approved after review.','Amount and party verified.','Bank details verified and approved.'];
    rej_remarks     TEXT[] := ARRAY['Incorrect party ledger.','Incorrect GST details.','Amount mismatch.','Supporting document missing.','Duplicate invoice.','Wrong stock item.'];
BEGIN

    FOREACH cid IN ARRAY ARRAY[1, 2] LOOP

        IF cid = 1 THEN
            SELECT user_id INTO v_admin_id    FROM users WHERE email = 'admin@testerp.com';
            SELECT user_id INTO v_approver_id FROM users WHERE email = 'accountant@testerp.com';
        ELSE
            SELECT user_id INTO v_admin_id    FROM users WHERE email = 'xyz-admin@testerp.com';
            SELECT user_id INTO v_approver_id FROM users WHERE email = 'xyz-accountant@testerp.com';
        END IF;

        SELECT ledger_id INTO v_sales    FROM ledgers WHERE company_id = cid AND ledger_name = 'Sales';
        SELECT ledger_id INTO v_purchase FROM ledgers WHERE company_id = cid AND ledger_name = 'Purchase';
        SELECT ledger_id INTO v_gst_out  FROM ledgers WHERE company_id = cid AND ledger_name = 'GST Output';
        SELECT ledger_id INTO v_gst_in   FROM ledgers WHERE company_id = cid AND ledger_name = 'GST Input';
        SELECT ledger_id INTO v_cash     FROM ledgers WHERE company_id = cid AND ledger_name = 'Cash';
        SELECT ledger_id INTO v_bank     FROM ledgers WHERE company_id = cid AND ledger_name = 'Bank Account';
        SELECT ledger_id INTO v_sret     FROM ledgers WHERE company_id = cid AND ledger_name = 'Sales Returns';
        SELECT ledger_id INTO v_pret     FROM ledgers WHERE company_id = cid AND ledger_name = 'Purchase Returns';
        SELECT ledger_id INTO v_int      FROM ledgers WHERE company_id = cid AND ledger_name = 'Interest Expense';

        SELECT COALESCE(array_agg(stock_item_id ORDER BY stock_item_id), ARRAY[]::int[])
          INTO v_item_ids
          FROM stock_items WHERE company_id = cid;

        FOR d IN 0..9 LOOP
            v_day_start := date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::timestamp
                           - (d || ' days')::interval;

            FOR st IN 0..2 LOOP
                IF st = 0 THEN v_status := 'PENDING';  v_cnt := day_p[d + 1];
                ELSIF st = 1 THEN v_status := 'ACCEPTED'; v_cnt := day_a[d + 1];
                ELSE v_status := 'REJECTED'; v_cnt := day_r[d + 1];
                END IF;

                IF v_cnt <= 0 THEN CONTINUE; END IF;

                FOR k IN 1..v_cnt LOOP

                    g := g + 1;
                    pos := ((g - 1) % 21) + 1;
                    v_type := v_cycle[pos];
                    v_abbr := v_abbr_cycle[pos];
                    ctr[array_position(v_abbr_all, v_abbr)] := ctr[array_position(v_abbr_all, v_abbr)] + 1;
                    v_code := 'TEST-' || v_abbr || '-' || LPAD(ctr[array_position(v_abbr_all, v_abbr)]::text, 4, '0');

                    -- party ledger (customer for Sales/Receipt/Credit Note/Journal, supplier otherwise)
                    IF cid = 1 THEN
                        IF v_abbr IN ('PUR','PAY','DN') THEN
                            v_party := suppliers_1[((g - 1) % 4) + 1];
                        ELSE
                            v_party := customers_1[((g - 1) % 5) + 1];
                        END IF;
                    ELSE
                        IF v_abbr IN ('PUR','PAY','DN') THEN
                            v_party := suppliers_2[((g - 1) % 4) + 1];
                        ELSE
                            v_party := customers_2[((g - 1) % 5) + 1];
                        END IF;
                    END IF;
                    SELECT ledger_id INTO v_party_id FROM ledgers
                     WHERE company_id = cid AND ledger_name = v_party;

                    -- created_at: 09:00..~17:00 within the business day
                    v_off := (g * 7) % 480;
                    v_created_at := (v_day_start + make_interval(mins => v_off)) AT TIME ZONE 'Asia/Kolkata';
                    v_narr := 'Test seed voucher ' || v_code || ' for ' ||
                              (CASE v_abbr WHEN 'SAL' THEN 'sales' WHEN 'PUR' THEN 'purchase'
                                           WHEN 'REC' THEN 'receipt' WHEN 'PAY' THEN 'payment'
                                           WHEN 'JRN' THEN 'journal' WHEN 'DN' THEN 'debit note'
                                           ELSE 'credit note' END);

                    v_remark := NULL;
                    IF v_status = 'ACCEPTED' THEN v_remark := acc_remarks[((g - 1) % 6) + 1];
                    ELSIF v_status = 'REJECTED' THEN v_remark := rej_remarks[((g - 1) % 6) + 1];
                    END IF;

                    -- ---- inventory lines (Sales / Purchase only) ---- --
                    v_taxable := 0;
                    IF v_type IN ('Sales', 'Purchase') THEN
                        TRUNCATE tmp_seed_lines;
                        FOR li IN 1..((g % 5) + 1) LOOP
                            v_line_item := v_item_ids[((g + li - 1) % 16) + 1];
                            v_rate  := v_rates[((g + li - 1) % 16) + 1];
                            v_disc  := v_discs[((g + li - 1) % 16) + 1];
                            v_qty   := ((g + li - 1) % 6)::numeric + 1;
                            v_line_amt := ROUND(v_qty * v_rate * (1 - v_disc / 100), 2);
                            INSERT INTO tmp_seed_lines
                                (stock_item_id, qty, rate, inclusive_rate, discount_percentage, amount)
                            VALUES (v_line_item, v_qty, v_rate,
                                    ROUND(v_rate * (1 - v_disc / 100), 2), v_disc, v_line_amt);
                            v_taxable := v_taxable + v_line_amt;
                        END LOOP;
                        v_gst_rate := CASE (g % 3) WHEN 0 THEN 0.05 WHEN 1 THEN 0.12 ELSE 0.18 END;
                        v_gst   := ROUND(v_taxable * v_gst_rate, 2);
                        v_total := ROUND(v_taxable + v_gst, 2);
                    ELSE
                        v_total := v_amounts[((g - 1) % 8) + 1];
                    END IF;

                    -- ---- voucher header ---- --
                    INSERT INTO vouchers
                        (company_id, voucher_number, voucher_type, party_ledger_id,
                         bill_to_address, ship_to_address, place_of_supply, cost_center,
                         total_amount, narration, remark, status, created_by, created_at)
                    VALUES
                        (cid, v_code, v_type, v_party_id,
                         'Office 12, Main Bazaar Road, Pune, Maharashtra 411001',
                         'Warehouse B, MIDC Industrial Area, Pune, Maharashtra 411018',
                         'Maharashtra', 'Cost Center ' || v_abbr,
                         v_total, v_narr, v_remark, v_status, v_admin_id, v_created_at)
                    RETURNING voucher_id INTO v_vid;

                    -- ---- inventory entries ---- --
                    IF v_type IN ('Sales', 'Purchase') THEN
                        INSERT INTO inventory_entries
                            (voucher_id, stock_item_id, qty, rate, inclusive_rate,
                             discount_percentage, amount)
                        SELECT v_vid, stock_item_id, qty, rate, inclusive_rate,
                               discount_percentage, amount
                          FROM tmp_seed_lines;
                    END IF;

                    -- ---- ledger entries (DR == CR == total_amount) ---- --
                    IF v_type = 'Sales' THEN
                        INSERT INTO ledger_entries (voucher_id, ledger_id, amount, entry_type) VALUES
                            (v_vid, v_party_id, v_total, 'DR'),
                            (v_vid, v_sales,    v_taxable, 'CR'),
                            (v_vid, v_gst_out,  v_gst,     'CR');
                    ELSIF v_type = 'Purchase' THEN
                        INSERT INTO ledger_entries (voucher_id, ledger_id, amount, entry_type) VALUES
                            (v_vid, v_purchase, v_taxable, 'DR'),
                            (v_vid, v_gst_in,   v_gst,     'DR'),
                            (v_vid, v_party_id, v_total,   'CR');
                    ELSIF v_type = 'Receipt' THEN
                        INSERT INTO ledger_entries (voucher_id, ledger_id, amount, entry_type) VALUES
                            (v_vid, CASE WHEN g % 2 = 0 THEN v_bank ELSE v_cash END, v_total, 'DR'),
                            (v_vid, v_party_id, v_total, 'CR');
                    ELSIF v_type = 'Payment' THEN
                        INSERT INTO ledger_entries (voucher_id, ledger_id, amount, entry_type) VALUES
                            (v_vid, v_party_id, v_total, 'DR'),
                            (v_vid, CASE WHEN g % 2 = 0 THEN v_bank ELSE v_cash END, v_total, 'CR');
                    ELSIF v_type = 'Journal' THEN
                        INSERT INTO ledger_entries (voucher_id, ledger_id, amount, entry_type) VALUES
                            (v_vid, v_int,  v_total, 'DR'),
                            (v_vid, v_cash, v_total, 'CR');
                    ELSIF v_type = 'Debit Note' THEN
                        INSERT INTO ledger_entries (voucher_id, ledger_id, amount, entry_type) VALUES
                            (v_vid, v_pret,     v_total, 'DR'),
                            (v_vid, v_party_id, v_total, 'CR');
                    ELSE -- Credit Note
                        INSERT INTO ledger_entries (voucher_id, ledger_id, amount, entry_type) VALUES
                            (v_vid, v_party_id, v_total, 'DR'),
                            (v_vid, v_sret,     v_total, 'CR');
                    END IF;

                    -- ---- approval history (only decided vouchers) ---- --
                    IF v_status IN ('ACCEPTED', 'REJECTED') THEN
                        INSERT INTO voucher_status_history
                            (voucher_id, old_status, new_status, remark, changed_by, changed_at)
                        VALUES
                            (v_vid, 'PENDING', v_status, v_remark, v_approver_id,
                             v_created_at + interval '8 minutes');
                    END IF;

                END LOOP; -- k
            END LOOP; -- st (status)
        END LOOP; -- d (day)
    END LOOP; -- cid (company)

END $$;

COMMIT;