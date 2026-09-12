const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

module.exports = async () => {
  process.env.NODE_ENV = 'test';
  require('dotenv').config({ path: path.resolve(__dirname, '../.env.test') });

  const host = process.env.DATABASE_HOST || 'localhost';
  const port = Number(process.env.DATABASE_PORT || 5432);
  const user = process.env.DATABASE_USER || 'postgres';
  const password = process.env.DATABASE_PASSWORD || '';
  const name = process.env.DATABASE_NAME || 'vam_backend_test';

  const admin = new Client({ host, port, user, password, database: 'postgres' });
  try {
    await admin.connect();
    try {
      await admin.query(`CREATE DATABASE "${name}"`);
      console.log(`[test] created database ${name}`);
    } catch (err) {
      if (err.code !== '42P04') throw err;
    }
  } finally {
    await admin.end().catch(() => {});
  }

  const client = new Client({ host, port, user, password, database: name });
  await client.connect();
  try {
    const dir = path.resolve(__dirname, '../supabase/migrations');
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of files) {
      await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
    }
    await client.query(
      'TRUNCATE voucher_status_history, inventory_entries, ledger_entries, vouchers, user_companies, users, ledgers, stock_items, companies RESTART IDENTITY CASCADE'
    );
    console.log('[test] migrations applied and tables truncated');
  } finally {
    await client.end();
  }
};