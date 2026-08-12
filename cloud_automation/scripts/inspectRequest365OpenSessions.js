#!/usr/bin/env node
/**
 * Inspect open (logout_at IS NULL) sessions for a request.
 * Usage:
 *   DATABASE_URL=... node scripts/inspectRequest365OpenSessions.js [--request-id 365]
 */
require('dotenv').config();

const { Client } = require('pg');

const parseArgs = () => {
  const args = process.argv.slice(2);
  let requestId = 365;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--request-id' && args[i + 1]) {
      requestId = Number(args[++i]);
    }
  }
  return { requestId };
};

async function main() {
  const { requestId } = parseArgs();
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const db = new Client({
    connectionString: process.env.DATABASE_URL.replace(/:6543\//, ':5432/'),
    ssl: process.env.SUPABASE_DB_SSL === 'false' ? false : undefined,
    connectionTimeoutMillis: 20000
  });
  await db.connect();

  try {
    const result = await db.query(
      `
        SELECT
          au.username,
          uus.id AS session_id,
          uus.login_at,
          uus.last_seen_at,
          ROUND(
            EXTRACT(EPOCH FROM (NOW() - COALESCE(uus.last_seen_at, uus.login_at))) / 60
          ) AS mins_since_seen,
          ROUND(EXTRACT(EPOCH FROM (NOW() - uus.login_at)) / 60) AS mins_open,
          au.last_signin_at,
          au.status AS db_status
        FROM user_usage_sessions uus
        JOIN azure_users au ON au.id = uus.user_id AND au.request_id = uus.request_id
        WHERE uus.request_id = $1
          AND uus.logout_at IS NULL
        ORDER BY mins_since_seen DESC NULLS LAST, au.username ASC
      `,
      [requestId]
    );

    console.log(`Open sessions for request #${requestId}: ${result.rows.length}\n`);
    for (const row of result.rows) {
      console.log(
        [
          row.username,
          `open=${row.mins_open}m`,
          `sinceSeen=${row.mins_since_seen}m`,
          `login=${row.login_at ? new Date(row.login_at).toISOString() : '—'}`,
          `lastSeen=${row.last_seen_at ? new Date(row.last_seen_at).toISOString() : '—'}`,
          `lastSignIn=${row.last_signin_at ? new Date(row.last_signin_at).toISOString() : '—'}`,
          `dbStatus=${row.db_status}`
        ].join(' | ')
      );
    }
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
