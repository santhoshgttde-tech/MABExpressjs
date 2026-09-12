const { app } = require('./app');
const { port, nodeEnv, appTimeZone } = require('./config/environment');
const { pool } = require('./config/database');

const HOST = '0.0.0.0';

const server = app.listen(port, HOST, () => {
  console.log(`[server] running in ${nodeEnv} mode on ${HOST}:${port}`);
  console.log(`[server] application timezone: ${appTimeZone}`);
  console.log(`[server] swagger docs: http://localhost:${port}/api-docs`);
});

async function shutdown(signal) {
  console.log(`[server] received ${signal}, shutting down`);
  server.close(async () => {
    try {
      await pool.end();
      console.log('[server] db pool closed');
      process.exit(0);
    } catch (err) {
      console.error('[server] error closing db pool', err);
      process.exit(1);
    }
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));