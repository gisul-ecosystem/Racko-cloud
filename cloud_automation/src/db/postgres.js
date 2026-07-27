const { Pool } = require('pg');
const { dbQueryGate, maxConcurrentDbOperations } = require('../utils/dbQueryGate');

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
  ? Math.min(configuredPoolMax, maxConcurrentDbOperations)
  : maxConcurrentDbOperations;

const configuredStatementTimeout = Number(process.env.SUPABASE_DB_STATEMENT_TIMEOUT_MS);
const configuredQueryTimeout = Number(process.env.SUPABASE_DB_QUERY_TIMEOUT_MS);
const statementTimeout =
  Number.isFinite(configuredStatementTimeout) && configuredStatementTimeout >= 0
    ? configuredStatementTimeout
    : 0;
const queryTimeout =
  Number.isFinite(configuredQueryTimeout) && configuredQueryTimeout >= 0
    ? configuredQueryTimeout
    : 0;

const pool = new Pool({
  connectionString,
  statement_timeout: statementTimeout,
  query_timeout: queryTimeout,
  ssl: process.env.SUPABASE_DB_SSL === 'false'
    ? false
    : { rejectUnauthorized: false },
  family: 4,
  keepAlive: true,
  max: poolMax,
  idleTimeoutMillis: Number(process.env.SUPABASE_DB_IDLE_TIMEOUT_MS) || 20000,
  connectionTimeoutMillis: Number(process.env.SUPABASE_DB_CONNECTION_TIMEOUT_MS) || 10000,
  allowExitOnIdle: true
});

let connectCount = 0;

pool.on('connect', () => {
  connectCount += 1;
  if (process.env.SUPABASE_DB_CONNECT_LOG === 'true') {
    console.log(`database_connected (${connectCount} total)`);
  }
});

pool.on('error', (err) => {
  console.error('database_error', err.message);
});

const wrapClientRelease = (client) => {
  const originalRelease = client.release.bind(client);
  let released = false;

  client.release = (error) => {
    if (released) {
      return;
    }

    released = true;

    try {
      originalRelease(error);
    } finally {
      dbQueryGate.release();
    }
  };

  return client;
};

const query = (text, params) => dbQueryGate.run(() => pool.query(text, params));

const connect = async () => {
  await dbQueryGate.acquire();

  try {
    const client = await pool.connect();
    return wrapClientRelease(client);
  } catch (error) {
    dbQueryGate.release();
    throw error;
  }
};

module.exports = {
  query,
  connect,
  end: () => pool.end(),
  pool
};
