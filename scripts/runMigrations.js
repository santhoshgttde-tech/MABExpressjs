const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { database } = require('../src/config/environment');

async function runMigrations(options = {}) {
  const pool = new Pool({
    connectionString: database.url,
    ssl: database.ssl ? { rejectUnauthorized: false } : undefined,
    max: 5,
    connectionTimeoutMillis: 15000,
  });
  const dir = options.dir || path.resolve(__dirname, '../supabase/migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const applied = [];

  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      const res = await client.query(sql);
      let affected = 0;
      if (Array.isArray(res)) {
        affected = res.reduce((sum, r) => sum + (r.rowCount ?? 0), 0);
      } else {
        affected = res.rowCount ?? 0;
      }
      applied.push(file);
      if (options.verbose !== false) {
        console.log(`[migrate] applied ${file} (rows affected: ${affected})`);
      }
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw new Error(`Migration ${file} failed: ${err.message}`);
    } finally {
      client.release();
    }
  }

  await pool.end();
  return applied;
}

module.exports = { runMigrations };

if (require.main === module) {
  runMigrations()
    .then((files) => {
      console.log(`[migrate] done (${files.length} applied)`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}