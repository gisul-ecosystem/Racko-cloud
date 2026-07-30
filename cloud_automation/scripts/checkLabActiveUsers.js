#!/usr/bin/env node
/**
 * Check whether any lab users in a request are currently active in Azure.
 *
 * Usage:
 *   node scripts/checkLabActiveUsers.js [requestId]
 *   node scripts/checkLabActiveUsers.js 307
 */
require('dotenv').config();

const db = require('../src/db/postgres');
const { Client } = require('@microsoft/microsoft-graph-client');
const { createAzureCredential } = require('../src/config/azure');

const REQUEST_ID = Number(process.argv[2] || 307);
const STALE_MINUTES = Number(process.env.SIGNIN_STALE_SESSION_MINUTES || 90);
const LOOKBACK_MINUTES = Number(process.env.SIGNIN_MONITOR_LOOKBACK_MINUTES || 180);

function createGraphClient() {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Missing AZURE_TENANT_ID, AZURE_CLIENT_ID, or AZURE_CLIENT_SECRET');
  }

  const credential = createAzureCredential({ tenantId, clientId, clientSecret });

  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => {
        const token = await credential.getToken('https://graph.microsoft.com/.default');
        return token.token;
      }
    }
  });
}

async function loadLabUsers(requestId) {
  const requestResult = await db.query(
    `
      SELECT id, project_name, customer_email, location, status, created_at, expires_at
      FROM requests
      WHERE id = $1
    `,
    [requestId]
  );

  if (!requestResult.rows.length) {
    throw new Error(`Request #${requestId} not found`);
  }

  const usersResult = await db.query(
    `
      SELECT
        au.id,
        au.username,
        au.azure_user_id,
        au.status,
        au.last_signin_at,
        au.azure_account_enabled,
        EXISTS (
          SELECT 1
          FROM user_usage_sessions uus
          WHERE uus.request_id = au.request_id
            AND uus.user_id = au.id
            AND uus.logout_at IS NULL
        ) AS has_open_session,
        (
          SELECT MAX(COALESCE(uus.last_seen_at, uus.login_at))
          FROM user_usage_sessions uus
          WHERE uus.request_id = au.request_id
            AND uus.user_id = au.id
            AND uus.logout_at IS NULL
        ) AS session_last_seen_at,
        (
          SELECT uus.login_at
          FROM user_usage_sessions uus
          WHERE uus.request_id = au.request_id
            AND uus.user_id = au.id
            AND uus.logout_at IS NULL
          ORDER BY uus.login_at DESC
          LIMIT 1
        ) AS session_login_at
      FROM azure_users au
      WHERE au.request_id = $1
        AND COALESCE(au.is_deleted, false) = false
      ORDER BY au.user_number ASC NULLS LAST, au.username ASC
    `,
    [requestId]
  );

  return {
    request: requestResult.rows[0],
    users: usersResult.rows
  };
}

async function fetchAzureSignInActivity(client, azureUserId) {
  try {
    const user = await client
      .api(`/users/${azureUserId}`)
      .select('id,userPrincipalName,signInActivity,accountEnabled')
      .get();

    const activity = user.signInActivity || {};
    const lastSignIn =
      activity.lastSuccessfulSignInDateTime ||
      activity.lastSignInDateTime ||
      activity.lastNonInteractiveSignInDateTime ||
      null;

    return {
      userPrincipalName: user.userPrincipalName || null,
      accountEnabled: user.accountEnabled !== false,
      lastSignIn: lastSignIn ? new Date(lastSignIn) : null
    };
  } catch (error) {
    return {
      userPrincipalName: null,
      accountEnabled: null,
      lastSignIn: null,
      error: error.message || String(error)
    };
  }
}

function minutesAgo(date) {
  if (!date) return null;
  return Math.round((Date.now() - date.getTime()) / 60000);
}

function formatWhen(date) {
  if (!date) return '—';
  return `${date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`;
}

async function main() {
  console.log(`Checking Azure activity for request #${REQUEST_ID}...\n`);

  const { request, users } = await loadLabUsers(REQUEST_ID);
  console.log(`Project: ${request.project_name || '—'}`);
  console.log(`Customer: ${request.customer_email}`);
  console.log(`Region: ${request.location}`);
  console.log(`Users: ${users.length}`);
  console.log(`Stale threshold: ${STALE_MINUTES} min | Graph lookback: ${LOOKBACK_MINUTES} min\n`);

  const client = createGraphClient();
  const lookbackCutoff = Date.now() - LOOKBACK_MINUTES * 60 * 1000;
  const staleCutoff = Date.now() - STALE_MINUTES * 60 * 1000;

  const activeUsers = [];
  const recentlySeenUsers = [];
  const offlineUsers = [];

  for (const user of users) {
    const azureActivity = user.azure_user_id
      ? await fetchAzureSignInActivity(client, user.azure_user_id)
      : { lastSignIn: null, error: 'Missing azure_user_id' };

    const sessionLastSeen = user.session_last_seen_at ? new Date(user.session_last_seen_at) : null;
    const recentAzureSignIn =
      azureActivity.lastSignIn && azureActivity.lastSignIn.getTime() >= lookbackCutoff;
    const recentSession =
      user.has_open_session &&
      sessionLastSeen &&
      sessionLastSeen.getTime() >= staleCutoff;

    const isActive = recentSession || recentAzureSignIn;

    const summary = {
      username: user.username,
      azureUserId: user.azure_user_id,
      dbStatus: user.status,
      accountEnabled: azureActivity.accountEnabled,
      hasOpenSession: user.has_open_session,
      sessionLoginAt: user.session_login_at,
      sessionLastSeenAt: sessionLastSeen,
      lastAzureSignIn: azureActivity.lastSignIn,
      lastAzureSignInMinsAgo: minutesAgo(azureActivity.lastSignIn),
      graphError: azureActivity.error || null,
      isActive
    };

    if (isActive) {
      activeUsers.push(summary);
    } else if (recentAzureSignIn || user.has_open_session) {
      recentlySeenUsers.push(summary);
    } else {
      offlineUsers.push(summary);
    }
  }

  console.log('='.repeat(72));
  console.log(`ACTIVE NOW: ${activeUsers.length}`);
  console.log('='.repeat(72));

  if (activeUsers.length === 0) {
    console.log('No users are currently active in Azure for this lab.\n');
  } else {
    for (const user of activeUsers) {
      console.log(`• ${user.username}`);
      console.log(`  Open session: ${user.hasOpenSession ? 'yes' : 'no'}`);
      console.log(`  Session last seen: ${formatWhen(user.sessionLastSeenAt)}`);
      console.log(`  Last Azure sign-in: ${formatWhen(user.lastAzureSignIn)} (${user.lastAzureSignInMinsAgo ?? '—'} min ago)`);
      console.log('');
    }
  }

  console.log('='.repeat(72));
  console.log(`RECENT BUT LIKELY OFFLINE: ${recentlySeenUsers.length}`);
  console.log('='.repeat(72));

  if (recentlySeenUsers.length === 0) {
    console.log('None.\n');
  } else {
    for (const user of recentlySeenUsers) {
      console.log(
        `• ${user.username} | openSession=${user.hasOpenSession} | lastSignIn=${formatWhen(user.lastAzureSignIn)}`
      );
    }
    console.log('');
  }

  console.log('='.repeat(72));
  console.log(`OFFLINE: ${offlineUsers.length}`);
  console.log('='.repeat(72));

  for (const user of offlineUsers.slice(0, 5)) {
    console.log(`• ${user.username} | lastSignIn=${formatWhen(user.lastAzureSignIn)}`);
  }
  if (offlineUsers.length > 5) {
    console.log(`... and ${offlineUsers.length - 5} more offline users`);
  }

  console.log('\nSummary:', {
    requestId: REQUEST_ID,
    totalUsers: users.length,
    activeNow: activeUsers.length,
    recentlySeen: recentlySeenUsers.length,
    offline: offlineUsers.length
  });

  await db.end();
}

main().catch(async (error) => {
  console.error('Check failed:', error.message || error);
  try {
    await db.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
