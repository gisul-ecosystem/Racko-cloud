require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL.replace(/:6543\//, ':5432/'),
    ssl: process.env.SUPABASE_DB_SSL === 'false' ? false : { rejectUnauthorized: false }
  });
  await client.connect();

  const index = await client.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE indexname = 'idx_one_open_session_per_user'
  `);

  const sessions = await client.query(`
    SELECT id, user_id, login_at, logout_at, last_seen_at, ended_reason, sign_in_id,
           EXTRACT(EPOCH FROM (logout_at - login_at)) AS duration_seconds
    FROM user_usage_sessions
    WHERE request_id = 235
    ORDER BY login_at
  `);

  const open = await client.query(`
    SELECT id, login_at, logout_at, last_seen_at
    FROM user_usage_sessions
    WHERE request_id = 235 AND logout_at IS NULL
  `);

  const overlappingIntervals = await client.query(`
    SELECT
      a.id AS a_id,
      b.id AS b_id,
      a.login_at AS a_login,
      b.login_at AS b_login,
      a.logout_at AS a_out,
      b.logout_at AS b_out
    FROM user_usage_sessions a
    JOIN user_usage_sessions b
      ON a.request_id = b.request_id
     AND a.user_id = b.user_id
     AND a.id < b.id
    WHERE a.request_id = 235
      AND a.login_at < COALESCE(b.logout_at, 'infinity'::timestamptz)
      AND b.login_at < COALESCE(a.logout_at, 'infinity'::timestamptz)
  `);

  console.log(JSON.stringify({ index: index.rows, sessions: sessions.rows, openSessions: open.rows, overlappingIntervals: overlappingIntervals.rows }, null, 2));
  await client.end();
})().catch((e) => { console.error(e); process.exit(1); });
