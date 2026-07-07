const { Client } = require('@microsoft/microsoft-graph-client');
const { DateTime } = require('luxon');
const { createAzureCredential } = require('../config/azure');
const db = require('../db/postgres');
const { evaluateUsageAccess } = require('./usageAccessEvaluator');
const usageEnforcementService = require('./usageEnforcementService');
const { resetDailyCountersIfNeeded } = require('./usageMiddlewareHelper');
const { getConsumedMinutesToday } = require('./dailyUsageEnforcementService');
const { resolveScheduleForRequest } = require('../utils/usageSchedule');
const {
  loadUsageWindowsByRequest,
  evaluateWindowDailyLimitAccess
} = require('./usageWindowAccessService');

const STALE_SESSION_MINUTES = Number(process.env.SIGNIN_STALE_SESSION_MINUTES || 10);
const SIGN_IN_LOOKBACK_MINUTES = Number(process.env.SIGNIN_MONITOR_LOOKBACK_MINUTES || 5);

/**
 * Create Microsoft Graph client with app-only authentication.
 * Requires application permissions (with admin consent):
 *   AuditLog.Read.All — sign-in logs
 *   Directory.Read.All — user lookup
 *   User.ReadWrite.All — disable/enable accounts
 * Verify: GET https://graph.microsoft.com/v1.0/auditLogs/signIns?$top=1
 */
const createGraphClient = () => {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      '[SIGNIN_MONITOR] Missing required Azure credentials: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET'
    );
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
};

const PASSWORD_INDEPENDENT_ERROR_CODES = new Set([
  50055,
  50125,
  50056
]);

const ALLOWED_APPS = [
  'Microsoft Azure Portal',
  'Azure Portal',
  'Azure Resource Manager',
  'Azure CLI',
  'Azure PowerShell',
  'Microsoft Azure',
  'Windows Azure Service Management API',
  'Microsoft Azure Active Directory'
];

const ALLOWED_RESOURCE_KEYWORDS = ['Azure', 'Windows Azure'];
const REJECTED_KEYWORDS = ['Outlook', 'Exchange', 'Office', 'Teams', 'Microsoft Graph', 'My Profile'];

const isTrackableSignIn = (signIn) => {
  const errorCode = Number(signIn.status?.errorCode ?? -1);
  return errorCode === 0 || PASSWORD_INDEPENDENT_ERROR_CODES.has(errorCode);
};

const isAzurePortalSignIn = (signIn) => {
  const appDisplayName = signIn.appDisplayName || '';
  const resourceDisplayName = signIn.resourceDisplayName || '';

  const isRejected = REJECTED_KEYWORDS.some(
    (keyword) => appDisplayName.includes(keyword) || resourceDisplayName.includes(keyword)
  );

  if (isRejected) {
    return false;
  }

  const isAllowedApp = ALLOWED_APPS.some((app) => appDisplayName.includes(app));
  const isAllowedResource = ALLOWED_RESOURCE_KEYWORDS.some((keyword) =>
    resourceDisplayName.includes(keyword)
  );

  return isAllowedApp || isAllowedResource;
};

const isSignInAlreadyProcessed = async (signInId) => {
  if (!signInId) {
    return false;
  }

  try {
    const result = await db.query(
      'SELECT 1 FROM processed_azure_signins WHERE signin_id = $1 LIMIT 1',
      [signInId]
    );
    return result.rows.length > 0;
  } catch (error) {
    console.warn('[SIGNIN_MONITOR] Sign-in dedupe unavailable:', error.message);
    return false;
  }
};

const markSignInProcessed = async ({ signInId, azureUserId, requestId, userId }) => {
  if (!signInId) {
    return;
  }

  try {
    await db.query(
      `
      INSERT INTO processed_azure_signins (signin_id, azure_user_id, request_id, user_id)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (signin_id) DO NOTHING
      `,
      [signInId, azureUserId, requestId, userId]
    );
  } catch (error) {
    console.warn('[SIGNIN_MONITOR] Could not record processed sign-in:', error.message);
  }
};

const loadTrackedUsers = async () => {
  const trackedUsersResult = await db.query(
    `
      SELECT
        au.id,
        au.request_id,
        au.username,
        au.azure_user_id,
        au.blocked_until,
        au.used_today_minutes,
        au.last_reset_date,
        au.status,
        au.azure_account_enabled,
        r.enable_daily_usage,
        r.daily_limit_minutes,
        r.usage_schedule,
        r.enforce_in_azure,
        r.expiry_date,
        EXISTS (
          SELECT 1
          FROM request_usage_windows ruw
          WHERE ruw.request_id = r.id
        ) AS has_usage_windows
      FROM azure_users au
      JOIN requests r ON r.id = au.request_id
      WHERE COALESCE(au.is_deleted, false) = false
        AND r.status = 'Completed'
        AND COALESCE(r.expired, false) = false
        AND (r.expiry_date IS NULL OR r.expiry_date > NOW())
    `
  );

  const trackedUsersMap = new Map();
  for (const user of trackedUsersResult.rows) {
    if (user.azure_user_id) {
      trackedUsersMap.set(String(user.azure_user_id).toLowerCase(), user);
    }
  }

  return {
    trackedUsersMap,
    usageWindowsByRequest: await loadUsageWindowsByRequest(
      [...new Set(trackedUsersResult.rows.map((user) => user.request_id))]
    )
  };
};

async function openUsageSession(user, signIn, loginTime) {
  let access = { allowed: true, reason: 'ok' };

  if (user.enable_daily_usage) {
    const request = {
      enable_daily_usage: user.enable_daily_usage,
      daily_limit_minutes: user.daily_limit_minutes,
      usage_schedule: user.usage_schedule
    };
    const refreshedUser = await resetDailyCountersIfNeeded(request, user, user.id, user.request_id);
    access = evaluateUsageAccess({
      request,
      user: refreshedUser,
      currentSessionMinutes: 0,
      at: loginTime
    });
  } else if (user.has_usage_windows) {
    const windows = (await loadUsageWindowsByRequest([user.request_id])).get(user.request_id) || [];
    access = await evaluateWindowDailyLimitAccess({
      requestId: user.request_id,
      userId: user.id,
      windows,
      at: loginTime
    });
  }

  if (!access.allowed) {
    console.log(
      `[SIGNIN_MONITOR] User ${user.id} denied Azure session (${access.reason}): ${access.message}`
    );

    if (user.enable_daily_usage && user.enforce_in_azure) {
      if (access.reason === 'limit_exceeded' || access.reason === 'daily_hour_limit_reached') {
        usageEnforcementService
          .enforceUsageLimit({ requestId: user.request_id, userId: user.id })
          .catch((error) => console.error('[SIGNIN_MONITOR] Enforcement error:', error.message));
      } else {
        usageEnforcementService
          .enforceScheduleViolation({
            requestId: user.request_id,
            userId: user.id,
            reason: access.reason,
            blockedUntil: access.blockedUntil,
            message: access.message
          })
          .catch((error) => console.error('[SIGNIN_MONITOR] Schedule enforcement error:', error.message));
      }
    } else if (user.has_usage_windows && access.reason === 'limit_exceeded') {
      usageEnforcementService
        .enforceUsageLimit({ requestId: user.request_id, userId: user.id })
        .catch((error) => console.error('[SIGNIN_MONITOR] Window limit enforcement error:', error.message));
    }

    return { action: 'denied', reason: access.reason };
  }

  const sessionResult = await db.query(
    `
      INSERT INTO user_usage_sessions (
        request_id,
        user_id,
        login_at,
        last_seen_at,
        sign_in_id,
        ip_address
      )
      VALUES ($1, $2, $3, $3, $4, $5)
      RETURNING id
    `,
    [
      user.request_id,
      user.id,
      loginTime,
      signIn.id || null,
      signIn.ipAddress || null
    ]
  );

  const sessionId = sessionResult.rows[0].id;

  await db.query(
    `
      UPDATE azure_users
      SET last_signin_at = NOW(),
          status = 'Active'
      WHERE id = $1
    `,
    [user.id]
  );

  console.log(
    `[SESSION_CREATED] Session ${sessionId} created for user ${user.id} (${user.username}) from Azure sign-in at ${loginTime.toISOString()}`
  );

  return { action: 'created', sessionId };
}

async function handleActiveSignIn(signIn, user) {
  const signInId = signIn.id || null;
  const azureUserId = signIn.userId;
  const loginTime = new Date(signIn.createdDateTime);

  const existingSession = await db.query(
    `
      SELECT id
      FROM user_usage_sessions
      WHERE request_id = $1
        AND user_id = $2
        AND logout_at IS NULL
      ORDER BY login_at DESC
      LIMIT 1
    `,
    [user.request_id, user.id]
  );

  if (existingSession.rows.length > 0) {
    await db.query(
      `
        UPDATE user_usage_sessions
        SET last_seen_at = NOW()
        WHERE id = $1
          AND logout_at IS NULL
      `,
      [existingSession.rows[0].id]
    );

    await db.query(
      `
        UPDATE azure_users
        SET last_signin_at = NOW(),
            status = CASE
              WHEN status = 'Blocked' THEN status
              ELSE 'Active'
            END
        WHERE id = $1
      `,
      [user.id]
    );

    if (signInId && !(await isSignInAlreadyProcessed(signInId))) {
      await markSignInProcessed({
        signInId,
        azureUserId,
        requestId: user.request_id,
        userId: user.id
      });
    }

    return { action: 'heartbeat', sessionId: existingSession.rows[0].id };
  }

  if (signInId && (await isSignInAlreadyProcessed(signInId))) {
    return { action: 'skipped' };
  }

  const result = await openUsageSession(user, signIn, loginTime);

  if (result.action === 'created' && signInId) {
    await markSignInProcessed({
      signInId,
      azureUserId,
      requestId: user.request_id,
      userId: user.id
    });
  }

  return result;
}

/**
 * Fetch recent Azure portal sign-ins and open/update usage sessions.
 */
async function detectActiveSignIns() {
  let fetchedCount = 0;
  let trackedCount = 0;
  let azurePortalCount = 0;
  let sessionsTouched = 0;

  try {
    console.log('[SIGNIN_MONITOR] Starting Azure sign-in detection...');

    const { trackedUsersMap } = await loadTrackedUsers();
    console.log(`[SIGNIN_MONITOR] Tracking ${trackedUsersMap.size} provisioned user(s).`);

    if (trackedUsersMap.size === 0) {
      console.log('[SIGNIN_MONITOR] No provisioned users to track. Exiting.');
      return 0;
    }

    const client = createGraphClient();
    const since = new Date(Date.now() - SIGN_IN_LOOKBACK_MINUTES * 60 * 1000).toISOString();
    console.log(`[SIGNIN_MONITOR] Fetching sign-ins since ${since}...`);

    const signIns = await client
      .api('/auditLogs/signIns')
      .filter(`createdDateTime ge ${since}`)
      .select('id,userId,userPrincipalName,createdDateTime,appDisplayName,resourceDisplayName,status,ipAddress')
      .top(999)
      .orderby('createdDateTime desc')
      .get();

    if (!signIns?.value?.length) {
      console.log('[SIGNIN_MONITOR] No sign-ins returned from Graph API.');
      return 0;
    }

    fetchedCount = signIns.value.length;
    console.log(`[SIGNIN_MONITOR] Found ${fetchedCount} recent sign-in(s)`);

    for (const signIn of signIns.value) {
      const normalizedUserId = signIn.userId ? String(signIn.userId).toLowerCase() : null;
      if (!normalizedUserId || !trackedUsersMap.has(normalizedUserId)) {
        continue;
      }

      if (!isTrackableSignIn(signIn)) {
        continue;
      }

      trackedCount++;

      if (!isAzurePortalSignIn(signIn)) {
        continue;
      }

      azurePortalCount++;
      const user = trackedUsersMap.get(normalizedUserId);
      const result = await handleActiveSignIn(signIn, user);

      if (result.action === 'created' || result.action === 'heartbeat') {
        sessionsTouched += 1;
      }
    }

    console.log(
      `[SIGNIN_MONITOR] Completed. Fetched=${fetchedCount}, Tracked=${trackedCount}, AzurePortal=${azurePortalCount}, SessionsTouched=${sessionsTouched}`
    );

    return sessionsTouched;
  } catch (error) {
    console.error('[SIGNIN_MONITOR] Error fetching sign-ins:', error.message);

    if (error.statusCode === 403) {
      console.error(
        '[SIGNIN_MONITOR] Permission denied. Ensure AuditLog.Read.All, Directory.Read.All, ' +
          'and User.ReadWrite.All application permissions are granted with admin consent.'
      );
    } else if (error.statusCode === 401) {
      console.error(
        '[SIGNIN_MONITOR] Authentication failed. Check AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET.'
      );
    }

    return 0;
  }
}

async function resolveTrackingTimezone(requestId, request) {
  const windowResult = await db.query(
    `
      SELECT timezone
      FROM request_usage_windows
      WHERE request_id = $1
      LIMIT 1
    `,
    [requestId]
  );

  return (
    windowResult.rows[0]?.timezone ||
    resolveScheduleForRequest(request)?.timezone ||
    'Asia/Kolkata'
  );
}

async function syncDailyUsageTracking({ requestId, userId, request }) {
  const timezone = await resolveTrackingTimezone(requestId, request);
  const trackingDate = DateTime.now().setZone(timezone).toISODate();
  const consumedMinutes = await getConsumedMinutesToday(userId, trackingDate, timezone);

  await db.query(
    `
      INSERT INTO daily_usage_tracking
        (request_id, azure_user_id, tracking_date, consumed_minutes)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (azure_user_id, tracking_date)
      DO UPDATE SET
        consumed_minutes = EXCLUDED.consumed_minutes,
        updated_at = NOW()
    `,
    [requestId, userId, trackingDate, consumedMinutes]
  );

  return consumedMinutes;
}

/**
 * Close sessions with no Azure sign-in heartbeat for STALE_SESSION_MINUTES.
 */
async function detectEndedSessions() {
  try {
    const staleThreshold = new Date(Date.now() - STALE_SESSION_MINUTES * 60 * 1000);

    const staleSessions = await db.query(
      `
        SELECT
          us.id,
          us.request_id,
          us.user_id,
          us.login_at,
          COALESCE(us.last_seen_at, us.login_at) AS effective_last_seen,
          au.username
        FROM user_usage_sessions us
        JOIN azure_users au ON au.id = us.user_id AND au.request_id = us.request_id
        WHERE us.logout_at IS NULL
          AND COALESCE(us.last_seen_at, us.login_at) < $1
      `,
      [staleThreshold]
    );

    for (const session of staleSessions.rows) {
      const lastSeen = new Date(session.effective_last_seen);
      const loginAt = new Date(session.login_at);
      const durationMins = Math.max(1, Math.floor((lastSeen - loginAt) / 60000));

      await db.query(
        `
          UPDATE user_usage_sessions
          SET
            logout_at = $1,
            minutes_used = $2,
            ended_reason = 'stale_signin'
          WHERE id = $3
        `,
        [lastSeen, durationMins, session.id]
      );

      const requestResult = await db.query(
        `
          SELECT enable_daily_usage, daily_limit_minutes, usage_schedule
          FROM requests
          WHERE id = $1
        `,
        [session.request_id]
      );

      const request = requestResult.rows[0];

      await db.query(
        `
          UPDATE azure_users
          SET used_today_minutes = COALESCE(used_today_minutes, 0) + $1
          WHERE id = $2 AND request_id = $3
        `,
        [durationMins, session.user_id, session.request_id]
      );

      await syncDailyUsageTracking({
        requestId: session.request_id,
        userId: session.user_id,
        request
      });

      const openSessionCheck = await db.query(
        `
          SELECT 1
          FROM user_usage_sessions
          WHERE request_id = $1
            AND user_id = $2
            AND logout_at IS NULL
          LIMIT 1
        `,
        [session.request_id, session.user_id]
      );

      if (openSessionCheck.rows.length === 0) {
        await db.query(
          `
            UPDATE azure_users
            SET status = CASE
              WHEN status = 'Blocked' THEN status
              ELSE 'Created'
            END
            WHERE id = $1 AND request_id = $2
          `,
          [session.user_id, session.request_id]
        );
      }

      console.log(
        `[SIGNIN_MONITOR] ✅ Closed stale session for ${session.username} — ${durationMins} mins accumulated`
      );
    }

    return staleSessions.rows.length;
  } catch (error) {
    console.error('[SIGNIN_MONITOR] Error detecting ended sessions:', error.message);
    return 0;
  }
}

/** @deprecated Use detectActiveSignIns */
const monitorAzureSignIns = detectActiveSignIns;

module.exports = {
  detectActiveSignIns,
  detectEndedSessions,
  monitorAzureSignIns,
  createGraphClient
};
