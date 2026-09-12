const path = require('path');
const fs = require('fs');

const nodeEnv = process.env.NODE_ENV || 'development';
const isTest = nodeEnv === 'test';

const envPath = path.resolve(process.cwd(), isTest ? '.env.test' : '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

const parseBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return value === 'true' || value === '1';
};

const databaseHost = process.env.DATABASE_HOST || 'localhost';
const databasePort = Number(process.env.DATABASE_PORT || 5432);
const databaseName = process.env.DATABASE_NAME || (isTest ? 'vam_backend_test' : 'vam_backend');
const databaseUser = process.env.DATABASE_USER || 'postgres';
const databasePassword = process.env.DATABASE_PASSWORD || '';

const databaseUrl =
  process.env.DATABASE_URL ||
  `postgres://${databaseUser}:${encodeURIComponent(databasePassword)}@${databaseHost}:${databasePort}/${databaseName}`;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function corsOrigin(origin, callback) {
  if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes('*')) {
    return callback(null, true);
  }
  if (allowedOrigins.includes(origin)) {
    return callback(null, true);
  }
  return callback(new Error('Not allowed by CORS.'));
}

module.exports = {
  nodeEnv,
  isTest,
  port: Number(process.env.PORT || 10000),
  appTimeZone: process.env.APP_TIMEZONE || 'Asia/Kolkata',
  jwt: {
    secret: process.env.JWT_SECRET || 'insecure-default-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  },
  database: {
    url: databaseUrl,
    ssl: parseBool(process.env.DATABASE_SSL),
    pool: {
      max: Number(process.env.PGPOOL_MAX || 10),
      min: Number(process.env.PGPOOL_MIN || 0),
      connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 10000),
    },
  },
  allowedOrigins,
  corsOptions: {
    origin: corsOrigin,
    credentials: true,
  },
  loginRateLimit: {
    windowMs: Number(process.env.LOGIN_RATE_WINDOW_MS || 15 * 60 * 1000),
    max: Number(process.env.LOGIN_RATE_MAX || 20),
  },
  apiRateLimit: {
    windowMs: Number(process.env.API_RATE_WINDOW_MS || 15 * 60 * 1000),
    max: Number(process.env.API_RATE_MAX || 500),
  },
};