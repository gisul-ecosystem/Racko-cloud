require('dotenv').config();
const { Client } = require('pg');
const { DateTime } = require('luxon');
const { loadTrackedUsers, detectActiveSignIns, createGraphClient } = require('../src/services/azureSignInMonitor');
const { loadUsageWindowsByRequest, evaluateWindowDailyLimitAccess } = require('../src/services/usageWindowAccessService');

const REQUEST_ID = 236;
const USER_ID = 2335;
const AZURE_USER_ID = '6348094d-6b3b-497e-bb39-55138c5c878b';

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL.replace(/:6543\//, ':5432/'),
    ssl: process.env.SUPABASE_DB_SSL === 'false' ? false : { rejectUnauthorized: false }
  });
  await client.connect();

  try {
    const request = await client.query(`
      SELECT id, status, expired, expiry_date, expires_at, enable_daily_usage
      FROM requests WHERE id = $1
    `, [REQUEST_ID]);

    const user = await client.query(`
      SELECT id, username, azure_user_id, azure_account_enabled, status, is_deleted
      FROM azure_users WHERE id = $1
    `, [USER_ID]);

    const sessions = await client.query(`
      SELECT id, login_at, logout_at, last_seen_at, ended_reason, sign_in_id
      FROM user_usage_sessions
      WHERE request_id = $1 AND user_id = $2
      ORDER BY login_at DESC
    `, [REQUEST_ID, USER_ID]);

    const processed = await client.query(`
      SELECT signin_id, created_at
      FROM processed_azure_signins
      WHERE request_id = $1 AND user_id = $2
      ORDER BY created_at DESC
      LIMIT 10
    `, [REQUEST_ID, USER_ID]);

    console.log('=== Request / User ===');
    console.log(JSON.stringify({ request: request.rows, user: user.rows, sessions: sessions.rows, processedSignIns: processed.rows }, null, 2));

    const { trackedUsersMap } = await loadTrackedUsers();
    const tracked = trackedUsersMap.get(AZURE_USER_ID.toLowerCase());
    console.log('\n=== loadTrackedUsers ===');
    console.log(JSON.stringify({
      mapSize: trackedUsersMap.size,
      userInMap: Boolean(tracked),
      trackedUser: tracked ? {
        id: tracked.id,
        request_id: tracked.request_id,
        has_usage_windows: tracked.has_usage_windows,
        enable_daily_usage: tracked.enable_daily_usage
      } : null
    }, null, 2));

    if (tracked) {
      const windows = (await loadUsageWindowsByRequest([Number(tracked.request_id)])).get(Number(tracked.request_id)) || [];
      const access = await evaluateWindowDailyLimitAccess({
        requestId: Number(tracked.request_id),
        userId: Number(tracked.id),
        windows,
        at: new Date()
      });
      console.log('\n=== openUsageSession window access preview ===');
      console.log(JSON.stringify({ windowCount: windows.length, access }, null, 2));
    }

    const lookback = Number(process.env.SIGNIN_MONITOR_LOOKBACK_MINUTES || 10);
    const since = new Date(Date.now() - lookback * 60 * 1000).toISOString();
    console.log(`\n=== Graph sign-ins since ${since} (${lookback}m lookback) ===`);

    try {
      const graph = createGraphClient();
      const signIns = await graph
        .api('/auditLogs/signIns')
        .filter(`createdDateTime ge ${since}`)
        .select('id,userId,userPrincipalName,createdDateTime,appDisplayName,resourceDisplayName,status')
        .top(999)
        .orderby('createdDateTime desc')
        .get();

      const forUser = (signIns?.value || []).filter(
        (s) => String(s.userId || '').toLowerCase() === AZURE_USER_ID.toLowerCase()
      );
      console.log(JSON.stringify({
        totalFetched: signIns?.value?.length || 0,
        forThisUser: forUser.length,
        signIns: forUser
      }, null, 2));
    } catch (graphError) {
      console.log('Graph error:', graphError.message);
    }

    console.log('\n=== Running detectActiveSignIns once ===');
    const touched = await detectActiveSignIns();

    const after = await client.query(`
      SELECT id, login_at, logout_at, last_seen_at, ended_reason, sign_in_id
      FROM user_usage_sessions
      WHERE request_id = $1 AND user_id = $2
      ORDER BY login_at DESC
    `, [REQUEST_ID, USER_ID]);

    const open = await client.query(`
      SELECT id, login_at, last_seen_at, sign_in_id
      FROM user_usage_sessions
      WHERE request_id = $1 AND user_id = $2 AND logout_at IS NULL
    `, [REQUEST_ID, USER_ID]);

    console.log(JSON.stringify({ sessionsTouched: touched, sessionsAfter: after.rows, openSessions: open.rows }, null, 2));
    console.log('\nNow UTC:', new Date().toISOString());
    console.log('Now IST:', DateTime.now().setZone('Asia/Kolkata').toISO());
  } finally {
    await client.end();
    process.exit(0);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
