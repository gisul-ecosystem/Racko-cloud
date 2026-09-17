const { Client } = require('pg');

const REQUEST_ID = 365;
const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://racko:RackoDb_ChangeMe_2026@103.99.38.216:5432/racko';

(async () => {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  const summary = await client.query(
    `
    SELECT
      COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) = 'active')::int AS active_users,
      COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM user_usage_sessions us
          WHERE us.request_id = au.request_id AND us.user_id = au.id AND us.logout_at IS NULL
        )
      )::int AS open_sessions,
      COUNT(*) FILTER (
        WHERE COALESCE(is_deleted, false) = false
          AND last_signin_at >= NOW() - INTERVAL '2 hours'
      )::int AS signed_in_last_2h
    FROM azure_users au
    WHERE au.request_id = $1
      AND COALESCE(au.is_deleted, false) = false
    `,
    [REQUEST_ID]
  );

  const activeUsers = await client.query(
    `
    SELECT au.user_number, au.username, au.status, au.last_signin_at,
           EXISTS (
             SELECT 1 FROM user_usage_sessions us
             WHERE us.request_id = au.request_id AND us.user_id = au.id AND us.logout_at IS NULL
           ) AS has_open_session
    FROM azure_users au
    WHERE au.request_id = $1
      AND COALESCE(au.is_deleted, false) = false
      AND (
        LOWER(COALESCE(au.status, '')) = 'active'
        OR EXISTS (
          SELECT 1 FROM user_usage_sessions us
          WHERE us.request_id = au.request_id AND us.user_id = au.id AND us.logout_at IS NULL
        )
      )
    ORDER BY au.user_number
    `,
    [REQUEST_ID]
  );

  console.log(JSON.stringify({ summary: summary.rows[0], users: activeUsers.rows }, null, 2));
  await client.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
