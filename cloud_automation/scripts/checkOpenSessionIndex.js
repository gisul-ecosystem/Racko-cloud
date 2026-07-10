require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL.replace(/:6543\//, ':5432/'),
    ssl: process.env.SUPABASE_DB_SSL === 'false' ? false : { rejectUnauthorized: false }
  });
  await client.connect();
  const index = await client.query(
    "SELECT indexname FROM pg_indexes WHERE indexname = 'idx_one_open_session_per_user'"
  );
  const dupOpen = await client.query(`
    SELECT request_id, user_id, COUNT(*)::int AS n
    FROM user_usage_sessions
    WHERE logout_at IS NULL
    GROUP BY request_id, user_id
    HAVING COUNT(*) > 1
    LIMIT 5
  `);
  console.log(JSON.stringify({ indexApplied: index.rows.length > 0, dupOpenSessions: dupOpen.rows }, null, 2));
  await client.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
