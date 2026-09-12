// Applies the SQL files in database/seed/ against the configured database.
//
// Usage:
//   npm run seed            -> database/seed/seed_test_data.sql
//   npm run seed:clear      -> database/seed/clear_test_data.sql
//
// Uses the same DATABASE_URL / SSL settings as the application
// (src/config/environment.js), so it works against the local database,
// the test database, or the Supabase hosted development database as long as
// .env points there. Each file is wrapped in its own transaction.
const path = require('path');
const { Pool } = require('pg');
const { database } = require('../src/config/environment');

async function run() {
  const mode = process.argv[2] === 'clear' ? 'clear_test_data.sql' : 'seed_test_data.sql';
  const filePath = path.resolve(__dirname, '../database/seed', mode);
  const sql = require('fs').readFileSync(filePath, 'utf8');

  const pool = new Pool({
    connectionString: database.url,
    ssl: database.ssl ? { rejectUnauthorized: false } : undefined,
    max: 3,
    connectionTimeoutMillis: 30000,
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log(`[seed] applied ${mode}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run()
  .then(() => {
    console.log('[seed] done');
    process.exit(0);
  })
  .catch((err) => {
    console.error(`[seed] FAILED: ${err.message}`);
    process.exit(1);
  });