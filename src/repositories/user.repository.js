const { pool } = require('../config/database');

const BASE_SELECT = `
  SELECT
    u.user_id,
    u.user_uuid,
    u.full_name,
    u.email,
    u.password_hash,
    u.company_id,
    u.role_id,
    r.role_name,
    u.level_id,
    l.level_name,
    u.access_type_id,
    a.type_name AS access_type_name,
    u.is_active,
    u.created_at
  FROM users u
  JOIN roles r         ON r.role_id = u.role_id
  JOIN user_levels l   ON l.level_id = u.level_id
  JOIN access_types a  ON a.access_type_id = u.access_type_id
`;

async function findByEmail(email) {
  const { rows } = await pool.query(`${BASE_SELECT} WHERE u.email = $1`, [email]);
  return rows[0] || null;
}

async function findById(userId) {
  const { rows } = await pool.query(`${BASE_SELECT} WHERE u.user_id = $1`, [userId]);
  return rows[0] || null;
}

async function getCompanyIdsForUser(userId) {
  const { rows } = await pool.query(
    `
    SELECT DISTINCT company_id
    FROM (
      SELECT company_id FROM users WHERE user_id = $1
      UNION
      SELECT company_id FROM user_companies WHERE user_id = $1
    ) t
    ORDER BY company_id
  `,
    [userId]
  );
  return rows.map((r) => r.company_id);
}

module.exports = { findByEmail, findById, getCompanyIdsForUser };