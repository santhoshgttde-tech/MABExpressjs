const { pool } = require('../config/database');

async function findById(companyId) {
  const { rows } = await pool.query(
    'SELECT company_id, company_uuid, company_name, created_at FROM companies WHERE company_id = $1',
    [companyId]
  );
  return rows[0] || null;
}

async function findManyByIds(companyIds) {
  if (!Array.isArray(companyIds) || companyIds.length === 0) return [];
  const { rows } = await pool.query(
    'SELECT company_id, company_name FROM companies WHERE company_id = ANY($1::int[]) ORDER BY company_id',
    [companyIds]
  );
  return rows;
}

module.exports = { findById, findManyByIds };