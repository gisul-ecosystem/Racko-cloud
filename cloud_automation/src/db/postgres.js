const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL missing');
}

// Supabase session pooler (6543) often hangs with node-pg; use session pooler (5432).
const connectionString = process.env.DATABASE_URL.replace(
  /\.pooler\.supabase\.com:6543\//,
  '.pooler.supabase.com:5432/'
);

const configuredPoolMax = Number(process.env.SUPABASE_DB_POOL_MAX);
const poolMax = Number.isFinite(configuredPoolMax) && configuredPoolMax > 0
  ? Math.min(configuredPoolMax, 12)
  : 8;

const pool = new Pool({
  connectionString,
  statement_timeout: 15000,
  query_timeout: 15000,
  ssl: process.env.SUPABASE_DB_SSL === 'false'
    ? false
    : { rejectUnauthorized: false },
  family: 4,
  keepAlive: true,
  max: poolMax,
  idleTimeoutMillis: Number(process.env.SUPABASE_DB_IDLE_TIMEOUT_MS) || 30000,
  connectionTimeoutMillis: Number(process.env.SUPABASE_DB_CONNECTION_TIMEOUT_MS) || 30000
});

pool.on('connect', () => {
  console.log('database_connected');
});

pool.on('error', (err) => {
  console.error('database_error', err.message);
});

module.exports = pool;
