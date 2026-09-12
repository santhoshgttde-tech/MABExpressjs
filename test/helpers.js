const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../src/config/database');
const { jwt: jwtConfig } = require('../src/config/environment');

const PASSWORD = 'password123';

async function query(text, params = []) {
  const result = await pool.query(text, params);
  return result;
}

async function seedCompany(name) {
  const { rows } = await pool.query(
    'INSERT INTO companies (company_name) VALUES ($1) RETURNING company_id, company_name',
    [name]
  );
  return rows[0];
}

async function roleId(roleName) {
  const { rows } = await pool.query('SELECT role_id FROM roles WHERE role_name = $1', [roleName]);
  if (!rows.length) throw new Error(`role not found: ${roleName}`);
  return rows[0].role_id;
}

async function levelId(levelName) {
  const { rows } = await pool.query('SELECT level_id FROM user_levels WHERE level_name = $1', [levelName]);
  if (!rows.length) throw new Error(`level not found: ${levelName}`);
  return rows[0].level_id;
}

async function accessTypeId(typeName) {
  const { rows } = await pool.query('SELECT access_type_id FROM access_types WHERE type_name = $1', [typeName]);
  if (!rows.length) throw new Error(`access type not found: ${typeName}`);
  return rows[0].access_type_id;
}

async function seedUser({
  companyId,
  email,
  name = 'Test User',
  roleName = 'Accountant',
  levelName = 'Level 1',
  accessTypeName = 'Read-Write',
  isActive = true,
}) {
  const [role_id, level_id, access_type_id] = await Promise.all([
    roleId(roleName),
    levelId(levelName),
    accessTypeId(accessTypeName),
  ]);
  const hash = await bcrypt.hash(PASSWORD, 4);
  const { rows } = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, company_id, role_id, level_id, access_type_id, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING user_id, full_name, email`,
    [name, email, hash, companyId, role_id, level_id, access_type_id, isActive]
  );
  return rows[0];
}

async function seedLedger(companyId, ledgerName) {
  const { rows } = await pool.query(
    'INSERT INTO ledgers (company_id, ledger_name) VALUES ($1, $2) RETURNING ledger_id, ledger_name',
    [companyId, ledgerName]
  );
  return rows[0];
}

async function seedStockItem(companyId, itemName) {
  const { rows } = await pool.query(
    'INSERT INTO stock_items (company_id, item_name) VALUES ($1, $2) RETURNING stock_item_id, item_name',
    [companyId, itemName]
  );
  return rows[0];
}

let voucherSeq = 1000;

async function seedVoucher({
  companyId,
  partyLedgerId,
  status = 'PENDING',
  remark = null,
  totalAmount = 12500,
  createdBy = null,
}) {
  voucherSeq += 1;
  const voucherNumber = `V-${voucherSeq}`;
  const { rows } = await pool.query(
    `INSERT INTO vouchers (company_id, voucher_number, voucher_type, party_ledger_id, bill_to_address, ship_to_address, place_of_supply, cost_center, total_amount, narration, remark, created_by, status)
     VALUES ($1, $2, 'Sales', $3, 'Bill To St', 'Ship To St', 'Karnataka', 'Head Office', $4, 'narration', $5, $6, $7)
     RETURNING voucher_id, voucher_number, status`,
    [companyId, voucherNumber, partyLedgerId, totalAmount, remark, createdBy, status]
  );
  return rows[0];
}

async function seedInventoryEntry({ voucherId, stockItemId, qty = 10, rate = 1000, amount = 10000 }) {
  await pool.query(
    `INSERT INTO inventory_entries (voucher_id, stock_item_id, qty, rate, inclusive_rate, discount_percentage, amount)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [voucherId, stockItemId, qty, rate, rate, 0, amount]
  );
}

async function seedLedgerEntry({ voucherId, ledgerId, amount = 12500, entryType = 'DR' }) {
  await pool.query(
    'INSERT INTO ledger_entries (voucher_id, ledger_id, amount, entry_type) VALUES ($1, $2, $3, $4)',
    [voucherId, ledgerId, amount, entryType]
  );
}

function tokenFor(userId, email) {
  return jwt.sign({ sub: userId, email }, jwtConfig.secret, { expiresIn: jwtConfig.expiresIn });
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

module.exports = {
  PASSWORD,
  query,
  seedCompany,
  seedUser,
  seedLedger,
  seedStockItem,
  seedVoucher,
  seedInventoryEntry,
  seedLedgerEntry,
  tokenFor,
  auth,
};