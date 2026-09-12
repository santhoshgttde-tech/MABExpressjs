const { Pool, types } = require('pg');
const { database } = require('./environment');

types.setTypeParser(1700, (value) => parseFloat(value));
types.setTypeParser(20, (value) => parseInt(value, 10));

const pool = new Pool({
  connectionString: database.url,
  ssl: database.ssl ? { rejectUnauthorized: false } : undefined,
  max: database.pool.max,
  min: database.pool.min,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: database.pool.connectionTimeoutMillis,
  application_name: 'vam-backend',
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});

async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, withTransaction };