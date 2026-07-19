require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL.replace(/:6543\//, ':5432/'),
    ssl: process.env.SUPABASE_DB_SSL === 'false' ? false : { rejectUnauthorized: false }
  });
  await client.connect();

  try {
    const request = await client.query(`
      SELECT id, expiry_date, expires_at, status, expired, enable_daily_usage, daily_limit_minutes
      FROM requests WHERE id = 235
    `);

    const user = await client.query(`
      SELECT id, username, azure_user_id, azure_account_enabled, status, is_deleted
      FROM azure_users WHERE request_id = 235
    `);

    const windows = await client.query(`
      SELECT day_of_week, window_start_time, window_end_time, timezone, daily_limit_hours
      FROM request_usage_windows WHERE request_id = 235 ORDER BY day_of_week
    `);

    const tracked = await client.query(`
      SELECT au.id, au.username, au.azure_user_id
      FROM azure_users au
      JOIN requests r ON r.id = au.request_id
      WHERE au.request_id = 235
        AND COALESCE(au.is_deleted, false) = false
        AND r.status = 'Completed'
        AND COALESCE(r.expired, false) = false
        AND (
          r.expiry_date IS NULL
          OR COALESCE(
            r.expires_at,
            (
              (r.expiry_date::text || ' ' || COALESCE(
                (SELECT LEFT(ruw.window_end_time::text, 8) FROM request_usage_windows ruw WHERE ruw.request_id = r.id ORDER BY ruw.day_of_week ASC LIMIT 1),
                '18:00:00'
              ))::timestamp AT TIME ZONE COALESCE(
                (SELECT ruw.timezone FROM request_usage_windows ruw WHERE ruw.request_id = r.id ORDER BY ruw.day_of_week ASC LIMIT 1),
                'Asia/Kolkata'
              )
            )
          ) > NOW()
        )
    `);

    console.log(JSON.stringify({
      lookbackMinutes: Number(process.env.SIGNIN_MONITOR_LOOKBACK_MINUTES || 10),
      nowUtc: new Date().toISOString(),
      nowIst: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      dayOfWeekUtc: new Date().getUTCDay(),
      request: request.rows,
      user: user.rows,
      usageWindows: windows.rows,
      passesLoadTrackedUsers: tracked.rows
    }, null, 2));
  } finally {
    await client.end();
  }
})().catch((e) => { console.error(e); process.exit(1); });
