#!/usr/bin/env node
require('dotenv').config();
const db = require('../src/db/postgres');

const REQUEST_ID = Number(process.argv[2] || 307);

(async () => {
  const users = await db.query(
    `
      SELECT
        au.id,
        au.username,
        au.status,
        au.last_resource_count,
        au.last_signin_at,
        au.azure_resource_group_name,
        EXISTS (
          SELECT 1 FROM user_usage_sessions uus
          WHERE uus.request_id = au.request_id AND uus.user_id = au.id AND uus.logout_at IS NULL
        ) AS has_open_session,
        (
          SELECT COUNT(*)::int FROM user_usage_sessions uus
          WHERE uus.request_id = au.request_id AND uus.user_id = au.id
            AND DATE(uus.login_at AT TIME ZONE 'Asia/Kolkata') = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
        ) AS sessions_today,
        COALESCE(ubs.current_spend, 0) AS stored_spend,
        ubs.last_synced_at
      FROM azure_users au
      LEFT JOIN user_budget_spend ubs ON ubs.azure_user_id = au.id
      WHERE au.request_id = $1 AND COALESCE(au.is_deleted, false) = false
      ORDER BY au.user_number ASC NULLS LAST, au.username ASC
    `,
    [REQUEST_ID]
  );

  console.log(`Request #${REQUEST_ID} — resource usage from Racko DB\n`);
  let withResources = 0;
  let online = 0;

  for (const u of users.rows) {
    const resources = Number(u.last_resource_count || 0);
    const active = u.has_open_session || resources > 0;
    if (resources > 0) withResources += 1;
    if (u.has_open_session) online += 1;

    console.log(
      `${u.username.padEnd(20)} | status=${String(u.status).padEnd(10)} | ` +
        `resources=${String(resources).padStart(2)} | session=${u.has_open_session ? 'OPEN' : 'closed'.padEnd(5)} | ` +
        `todaySessions=${u.sessions_today} | storedSpend=$${Number(u.stored_spend).toFixed(2)}`
    );
  }

  console.log(`\nSummary: ${withResources}/11 users have resources | ${online}/11 have open sessions`);
  await db.end();
})().catch(async (e) => {
  console.error(e.message || e);
  try { await db.end(); } catch {}
  process.exit(1);
});
