const { runMigrations } = require('./runMigrations');

async function start() {
  console.log('[start] applying migrations before boot...');
  await runMigrations();
  require('../src/server');
}

start().catch((err) => {
  console.error('[start] failed:', err.message);
  process.exit(1);
});