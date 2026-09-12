-- ============================================================================
-- Clear: Remove ALL data created by seed_test_data.sql
--
--   npm run seed:clear
--
-- Deletes only the two test companies and their dependent rows (vouchers,
-- inventory entries, ledger entries, status history), the stock items and
-- ledgers of those companies, every user whose email ends in "@testerp.com",
-- their user_companies mappings, and finally the companies themselves.
--
-- All other (production / existing) data is untouched.
-- ============================================================================

BEGIN;

DELETE FROM voucher_status_history
 WHERE voucher_id IN (
     SELECT v.voucher_id
       FROM vouchers v
       JOIN companies c ON c.company_id = v.company_id
      WHERE c.company_name IN ('ABC Enterprises Pvt Ltd', 'XYZ Trading & Distribution Pvt Ltd')
 );

DELETE FROM vouchers
 WHERE company_id IN (
     SELECT company_id
       FROM companies
      WHERE company_name IN ('ABC Enterprises Pvt Ltd', 'XYZ Trading & Distribution Pvt Ltd')
 );

DELETE FROM user_companies
 WHERE user_id IN (SELECT user_id FROM users WHERE email LIKE '%@testerp.com');

DELETE FROM users
 WHERE email LIKE '%@testerp.com'
    OR company_id IN (
         SELECT company_id
           FROM companies
          WHERE company_name IN ('ABC Enterprises Pvt Ltd', 'XYZ Trading & Distribution Pvt Ltd')
    );

DELETE FROM stock_items
 WHERE company_id IN (
     SELECT company_id
       FROM companies
      WHERE company_name IN ('ABC Enterprises Pvt Ltd', 'XYZ Trading & Distribution Pvt Ltd')
 );

DELETE FROM ledgers
 WHERE company_id IN (
     SELECT company_id
       FROM companies
      WHERE company_name IN ('ABC Enterprises Pvt Ltd', 'XYZ Trading & Distribution Pvt Ltd')
 );

DELETE FROM companies
 WHERE company_name IN ('ABC Enterprises Pvt Ltd', 'XYZ Trading & Distribution Pvt Ltd');

COMMIT;