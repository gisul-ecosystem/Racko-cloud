#!/usr/bin/env node
require('dotenv').config();

const db = require('../src/db/postgres');
const { createGraphClient } = require('../src/provisioners/azure/userProvisioner');
const { loadTrackedUsers } = require('../src/services/azureSignInMonitor');
const { ResourceManagementClient } = require('@azure/arm-resources');
const { createAzureCredential, validateAzureEnv } = require('../src/config/azure');

const REQUEST_ID = Number(process.argv[2] || 313);
const USERNAME = process.argv[3] || 'cust-313-user-6';

(async () => {
  const userResult = await db.query(
    `
      SELECT au.*, r.status AS request_status, r.expired, r.expires_at, r.starts_at, r.project_name
      FROM azure_users au
      JOIN requests r ON r.id = au.request_id
      WHERE au.request_id = $1
        AND lower(au.username) = lower($2)
    `,
    [REQUEST_ID, USERNAME]
  );

  if (!userResult.rows.length) {
    throw new Error(`${USERNAME} not found on request #${REQUEST_ID}`);
  }

  const user = userResult.rows[0];

  const sessions = await db.query(
    `
      SELECT id, login_at, logout_at, last_seen_at, minutes_used, ended_reason, sign_in_id, ip_address
      FROM user_usage_sessions
      WHERE request_id = $1 AND user_id = $2
      ORDER BY login_at DESC
      LIMIT 15
    `,
    [REQUEST_ID, user.id]
  );

  const openSessions = await db.query(
    `
      SELECT id, login_at, last_seen_at
      FROM user_usage_sessions
      WHERE request_id = $1 AND user_id = $2 AND logout_at IS NULL
    `,
    [REQUEST_ID, user.id]
  );

  const processed = await db.query(
    `
      SELECT signin_id, created_at
      FROM processed_azure_signins
      WHERE request_id = $1 AND user_id = $2
      ORDER BY created_at DESC
      LIMIT 15
    `,
    [REQUEST_ID, user.id]
  );

  const windows = await db.query(
    `SELECT * FROM request_usage_windows WHERE request_id = $1 ORDER BY day_of_week`,
    [REQUEST_ID]
  );

  const allUsersSummary = await db.query(
    `
      SELECT
        au.username,
        au.last_resource_count,
        EXISTS (
          SELECT 1 FROM user_usage_sessions uus
          WHERE uus.request_id = au.request_id AND uus.user_id = au.id AND uus.logout_at IS NULL
        ) AS has_open_session,
        (
          SELECT COUNT(*)::int FROM user_usage_sessions uus
          WHERE uus.request_id = au.request_id AND uus.user_id = au.id
            AND DATE(uus.login_at AT TIME ZONE 'Asia/Kolkata') = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
        ) AS sessions_today
      FROM azure_users au
      WHERE au.request_id = $1 AND COALESCE(au.is_deleted, false) = false
      ORDER BY au.username
    `,
    [REQUEST_ID]
  );

  const { trackedUsersMap } = await loadTrackedUsers();
  const tracked = trackedUsersMap.get(String(user.azure_user_id || '').toLowerCase());

  console.log('=== Request #313 user detail ===');
  console.log({
    project: user.project_name,
    username: user.username,
    userId: user.id,
    azureUserId: user.azure_user_id,
    resourceGroup: user.azure_resource_group_name,
    lastResourceCount: user.last_resource_count,
    requestStatus: user.request_status,
    expired: user.expired,
    expiresAt: user.expires_at,
    startsAt: user.starts_at,
    azureAccountEnabled: user.azure_account_enabled,
    status: user.status,
    lastSigninAt: user.last_signin_at
  });

  console.log('\n=== Usage windows ===');
  console.log(windows.rows.length ? windows.rows : 'none (legacy/no window enforcement)');

  console.log('\n=== Sign-in monitor tracking ===');
  console.log({
    inTrackedUsersMap: Boolean(tracked),
    trackedRequestId: tracked?.request_id || null,
    hasUsageWindows: tracked?.has_usage_windows || false,
    enableDailyUsage: tracked?.enable_daily_usage || false
  });

  console.log('\n=== DB sessions (recent) ===');
  console.log(sessions.rows.length ? sessions.rows : 'NO SESSIONS RECORDED');

  console.log('\n=== Open sessions ===');
  console.log(openSessions.rows.length ? openSessions.rows : 'NONE');

  console.log('\n=== Processed Azure sign-ins ===');
  console.log(processed.rows.length ? processed.rows : 'NONE');

  if (user.azure_user_id) {
    const { graphClient } = createGraphClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    try {
      const signIns = await graphClient
        .api('/auditLogs/signIns')
        .filter(`createdDateTime ge ${since} and userId eq '${user.azure_user_id}'`)
        .top(15)
        .orderby('createdDateTime desc')
        .get();

      console.log('\n=== Azure Graph sign-ins (24h) ===');
      console.log(
        (signIns.value || []).map((entry) => ({
          at: entry.createdDateTime,
          app: entry.appDisplayName,
          resource: entry.resourceDisplayName,
          status: entry.status?.errorCode,
          ip: entry.ipAddress,
          id: entry.id
        }))
      );
    } catch (error) {
      console.log('\n=== Azure Graph sign-ins ERROR ===');
      console.log(error.message);
    }
  }

  if (user.azure_resource_group_name) {
    const cfg = validateAzureEnv();
    const arm = new ResourceManagementClient(createAzureCredential(cfg), cfg.subscriptionId);
    const resources = [];

    for await (const resource of arm.resources.listByResourceGroup(user.azure_resource_group_name)) {
      resources.push({
        name: resource.name,
        type: resource.type?.split('/').pop(),
        state: resource.properties?.provisioningState,
        createdAt: resource.systemData?.createdAt
      });
    }

    console.log('\n=== Live Azure resources in RG ===');
    console.log(resources);
  }

  console.log('\n=== All users: resources vs sessions ===');
  for (const row of allUsersSummary.rows) {
    if (Number(row.last_resource_count) > 0 || row.has_open_session || row.sessions_today > 0) {
      console.log(
        `${row.username}: resources=${row.last_resource_count} openSession=${row.has_open_session} sessionsToday=${row.sessions_today}`
      );
    }
  }

  await db.end();
})().catch(async (error) => {
  console.error(error.message || error);
  try {
    await db.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
