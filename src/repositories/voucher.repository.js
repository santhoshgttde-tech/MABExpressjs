const { pool } = require('../config/database');

function escapeLike(value) {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

async function countStatusCounts(companyId, start, end) {
  const { rows } = await pool.query(
    `
    SELECT status, COUNT(*) AS count
    FROM vouchers
    WHERE company_id = $1 AND created_at >= $2 AND created_at < $3
    GROUP BY status
  `,
    [companyId, start, end]
  );
  return rows;
}

async function listVouchers({ companyId, status, start, end, search, page, limit }) {
  const conditions = [
    'v.company_id = $1',
    'v.created_at >= $2',
    'v.created_at < $3',
  ];
  const params = [companyId, start, end];
  let index = 4;

  if (status) {
    conditions.push(`v.status = $${index}`);
    params.push(status);
    index += 1;
  }

  if (search) {
    const escaped = escapeLike(search);
    conditions.push(`(v.voucher_number ILIKE $${index} OR l.ledger_name ILIKE $${index})`);
    params.push(`%${escaped}%`);
    index += 1;
  }

  const whereSql = conditions.join(' AND ');

  const countResult = await pool.query(
    `
    SELECT COUNT(*) AS total
    FROM vouchers v
    JOIN ledgers l ON l.ledger_id = v.party_ledger_id
    WHERE ${whereSql}
  `,
    params
  );
  const total = countResult.rows[0].total;

  const listParams = [...params, limit, (page - 1) * limit];
  const { rows } = await pool.query(
    `
    SELECT
      v.voucher_id,
      v.voucher_number,
      v.total_amount AS amount,
      v.status,
      l.ledger_name AS party_ledger_name
    FROM vouchers v
    JOIN ledgers l ON l.ledger_id = v.party_ledger_id
    WHERE ${whereSql}
    ORDER BY v.voucher_id DESC
    LIMIT $${index} OFFSET $${index + 1}
  `,
    listParams
  );

  return { rows, total };
}

async function findVoucherById(voucherId) {
  const { rows } = await pool.query(
    'SELECT voucher_id, company_id, voucher_number, status, remark FROM vouchers WHERE voucher_id = $1',
    [voucherId]
  );
  return rows[0] || null;
}

async function findVoucherHeader(voucherId) {
  const { rows } = await pool.query(
    `
    SELECT
      v.voucher_id,
      v.voucher_uuid,
      v.company_id,
      v.voucher_number,
      v.voucher_type,
      v.party_ledger_id,
      l.ledger_name AS party_ledger_name,
      v.bill_to_address,
      v.ship_to_address,
      v.place_of_supply,
      v.cost_center,
      v.total_amount,
      v.narration,
      v.remark,
      v.status,
      v.created_by,
      u.full_name AS created_by_name,
      v.created_at
    FROM vouchers v
    JOIN ledgers l ON l.ledger_id = v.party_ledger_id
    LEFT JOIN users u ON u.user_id = v.created_by
    WHERE v.voucher_id = $1
  `,
    [voucherId]
  );
  return rows[0] || null;
}

async function findInventoryEntriesByVoucher(voucherId) {
  const { rows } = await pool.query(
    `
    SELECT
      ie.entry_id,
      ie.stock_item_id,
      si.item_name AS stock_item_name,
      ie.qty,
      ie.rate,
      ie.inclusive_rate,
      ie.discount_percentage,
      ie.amount
    FROM inventory_entries ie
    JOIN stock_items si ON si.stock_item_id = ie.stock_item_id
    WHERE ie.voucher_id = $1
    ORDER BY ie.entry_id
  `,
    [voucherId]
  );
  return rows;
}

async function findLedgerEntriesByVoucher(voucherId) {
  const { rows } = await pool.query(
    `
    SELECT
      le.entry_id,
      le.ledger_id,
      lg.ledger_name,
      le.amount,
      le.entry_type
    FROM ledger_entries le
    JOIN ledgers lg ON lg.ledger_id = le.ledger_id
    WHERE le.voucher_id = $1
    ORDER BY le.entry_id
  `,
    [voucherId]
  );
  return rows;
}

async function findVoucherByIdForUpdate(client, voucherId) {
  const { rows } = await client.query(
    'SELECT voucher_id, voucher_number, company_id, status FROM vouchers WHERE voucher_id = $1 FOR UPDATE',
    [voucherId]
  );
  return rows[0] || null;
}

async function updateStatus(client, voucherId, newStatus, remark, expectedStatus) {
  const result = await client.query(
    `
    UPDATE vouchers
    SET status = $1, remark = $2
    WHERE voucher_id = $3 AND status = $4
  `,
    [newStatus, remark, voucherId, expectedStatus]
  );
  return result.rowCount;
}

async function insertStatusHistory(client, { voucherId, oldStatus, newStatus, remark, changedBy }) {
  await client.query(
    `
    INSERT INTO voucher_status_history (voucher_id, old_status, new_status, remark, changed_by)
    VALUES ($1, $2, $3, $4, $5)
  `,
    [voucherId, oldStatus, newStatus, remark, changedBy]
  );
}

async function findStatusHistoryByVoucher(voucherId) {
  const { rows } = await pool.query(
    `
    SELECT
      vsh.history_id,
      vsh.old_status,
      vsh.new_status,
      vsh.remark,
      vsh.changed_by,
      u.full_name AS changed_by_name,
      vsh.changed_at
    FROM voucher_status_history vsh
    LEFT JOIN users u ON u.user_id = vsh.changed_by
    WHERE vsh.voucher_id = $1
    ORDER BY vsh.history_id
  `,
    [voucherId]
  );
  return rows;
}

module.exports = {
  countStatusCounts,
  listVouchers,
  findVoucherById,
  findVoucherHeader,
  findInventoryEntriesByVoucher,
  findLedgerEntriesByVoucher,
  findVoucherByIdForUpdate,
  updateStatus,
  insertStatusHistory,
  findStatusHistoryByVoucher,
};