require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL.replace(/:6543\//, ':5432/'),
    ssl: process.env.SUPABASE_DB_SSL === 'false' ? false : { rejectUnauthorized: false }
  });
  await client.connect();

  try {
    const columns = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'requests'
        AND column_name IN ('expiry_date', 'expires_at', 'expired', 'status')
      ORDER BY column_name
    `);

    const request = await client.query(`
      SELECT id, expiry_date, expires_at, status
      FROM requests
      WHERE id = 234
    `);

    const users = await client.query(`
      SELECT azure_account_enabled, status
      FROM azure_users
      WHERE request_id = 234
    `);

    const filterCheck = await client.query(`
      SELECT
        au.id,
        au.username,
        au.azure_user_id,
        au.azure_account_enabled,
        r.status,
        r.expired,
        r.expiry_date,
        r.expiry_date > NOW() AS expiry_date_gt_now,
        r.expiry_date >= CURRENT_DATE AS expiry_date_gte_today,
        (r.expiry_date IS NULL OR r.expiry_date > NOW()) AS passes_loadTrackedUsers_expiry,
        COALESCE(au.is_deleted, false) = false AS passes_not_deleted,
        r.status = 'Completed' AS passes_status,
        COALESCE(r.expired, false) = false AS passes_not_expired_flag
      FROM azure_users au
      JOIN requests r ON r.id = au.request_id
      WHERE au.request_id = 234
    `);

    const trackedSim = await client.query(`
      SELECT au.id, au.username, au.azure_user_id
      FROM azure_users au
      JOIN requests r ON r.id = au.request_id
      WHERE COALESCE(au.is_deleted, false) = false
        AND r.status = 'Completed'
        AND COALESCE(r.expired, false) = false
        AND (r.expiry_date IS NULL OR r.expiry_date > NOW())
        AND au.request_id = 234
    `);

    console.log(JSON.stringify({
      requestColumns: columns.rows,
      request: request.rows,
      users: users.rows,
      filterCheck: filterCheck.rows,
      wouldBeTrackedByCurrentQuery: trackedSim.rows,
      nowUtc: new Date().toISOString()
    }, null, 2));
  } finally {
    await client.end();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
