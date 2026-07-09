const { Client } = require('@microsoft/microsoft-graph-client');
const { DateTime } = require('luxon');
const { createAzureCredential } = require('../config/azure');
const db = require('../db/postgres');
const { evaluateUsageAccess } = require('./usageAccessEvaluator');
const usageEnforcementService = require('./usageEnforcementService');
const { isWindowEnforcementPaused } = require('../utils/windowEnforcementPause');
const { resetDailyCountersIfNeeded } = require('./usageMiddlewareHelper');
const {
  getClosedSessionMinutesToday,
  getConsumedMinutesToday
} = require('./dailyUsageEnforcementService');
const { resolveScheduleForRequest } = require('../utils/usageSchedule');
const { resolveStaleSessionClose } = require('../utils/staleSessionClose');
const { isUniqueOpenSessionViolation } = require('../utils/openSessionConstraint');
const { isSignInNearOpenSession, getSignInSessionProximityMs } = require('../utils/signInSessionProximity');
const {
  loadUsageWindowsByRequest,
  evaluateWindowDailyLimitAccess
} = require('./usageWindowAccessService');

const REQUEST_NOT_EXPIRED_SQL = `
  (
    r.expiry_date IS NULL
    OR COALESCE(
      r.expires_at,
      (
        (r.expiry_date::text || ' ' || COALESCE(
          (
            SELECT LEFT(ruw.window_end_time::text, 8)
            FROM request_usage_windows ruw
            WHERE ruw.request_id = r.id
            ORDER BY ruw.day_of_week ASC
            LIMIT 1
          ),
          '18:00:00'
        ))::timestamp AT TIME ZONE COALESCE(
          (
            SELECT ruw.timezone
            FROM request_usage_windows ruw
            WHERE ruw.request_id = r.id
            ORDER BY ruw.day_of_week ASC
            LIMIT 1
          ),
          'Asia/Kolkata'
        )
      )
    ) > NOW()
  )
`;

const STALE_SESSION_MINUTES = Number(process.env.SIGNIN_STALE_SESSION_MINUTES || 20);
const SIGN_IN_LOOKBACK_MINUTES = Number(process.env.SIGNIN_MONITOR_LOOKBACK_MINUTES || 10);

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

const markSignInProcessed = async ({ signInId, azureUserId, requestId, userId }, client = db) => {
  if (!signInId) {
    return;
  }

  try {
    await client.query(
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
        au.window_enforcement_paused_until,
        r.enable_daily_usage,
        r.daily_limit_minutes,
        r.usage_schedule,
        r.enforce_in_azure,
        r.expiry_date,
        r.expires_at,
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
        AND ${REQUEST_NOT_EXPIRED_SQL}
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

async function findOpenSessionForSignIn(requestId, userId, loginTime, client = db) {
  const result = await client.query(
    `
      SELECT id, login_at
      FROM user_usage_sessions
      WHERE request_id = $1
        AND user_id = $2
        AND logout_at IS NULL
      ORDER BY login_at DESC
      LIMIT 1
    `,
    [requestId, userId]
  );

  if (!result.rows.length) {
    return null;
  }

  return result.rows[0];
}

async function heartbeatUsageSession({
  sessionId,
  userId,
  signInId,
  azureUserId,
  requestId
}) {
  await db.query(
    `
      UPDATE user_usage_sessions
      SET last_seen_at = NOW()
      WHERE id = $1
        AND logout_at IS NULL
    `,
    [sessionId]
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
    [userId]
  );

  if (signInId && !(await isSignInAlreadyProcessed(signInId))) {
    await markSignInProcessed({
      signInId,
      azureUserId,
      requestId,
      userId
    });
  }

  return { action: 'heartbeat', sessionId };
}

async function openUsageSession(user, signIn, loginTime) {
  let access = { allowed: true, reason: 'ok' };

  if (isWindowEnforcementPaused(user)) {
    access = { allowed: true, reason: 'ok' };
  } else if (user.enable_daily_usage) {
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
    const windows =
      (await loadUsageWindowsByRequest([Number(user.request_id)])).get(Number(user.request_id)) || [];
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

    if (!isWindowEnforcementPaused(user) && user.enable_daily_usage && user.enforce_in_azure) {
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
    } else if (
      !isWindowEnforcementPaused(user)
      && user.has_usage_windows
      && access.reason === 'limit_exceeded'
    ) {
      usageEnforcementService
        .enforceUsageLimit({ requestId: user.request_id, userId: user.id })
        .catch((error) => console.error('[SIGNIN_MONITOR] Window limit enforcement error:', error.message));
    }

    return { action: 'denied', reason: access.reason };
  }

  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const existingSession = await client.query(
      `
        SELECT id
        FROM user_usage_sessions
        WHERE request_id = $1
          AND user_id = $2
          AND logout_at IS NULL
        FOR UPDATE
      `,
      [user.request_id, user.id]
    );

    if (existingSession.rows.length > 0) {
      await client.query('COMMIT');
      return heartbeatUsageSession({
        sessionId: existingSession.rows[0].id,
        userId: user.id,
        signInId: signIn.id || null,
        azureUserId: signIn.userId,
        requestId: user.request_id
      });
    }

    let sessionResult;

    try {
      sessionResult = await client.query(
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
    } catch (insertError) {
      if (!isUniqueOpenSessionViolation(insertError)) {
        throw insertError;
      }

      const racedSession = await client.query(
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

      if (!racedSession.rows.length) {
        throw insertError;
      }

      await client.query('COMMIT');
      return heartbeatUsageSession({
        sessionId: racedSession.rows[0].id,
        userId: user.id,
        signInId: signIn.id || null,
        azureUserId: signIn.userId,
        requestId: user.request_id
      });
    }

    const sessionId = sessionResult.rows[0].id;

    await client.query(
      `
        UPDATE azure_users
        SET last_signin_at = NOW(),
            status = 'Active'
        WHERE id = $1
      `,
      [user.id]
    );

    await client.query('COMMIT');

    console.log(
      `[SESSION_CREATED] Session ${sessionId} created for user ${user.id} (${user.username}) from Azure sign-in at ${loginTime.toISOString()}`
    );

    return { action: 'created', sessionId };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function handleActiveSignIn(signIn, user) {
  const signInId = signIn.id || null;
  const azureUserId = signIn.userId;
  const loginTime = new Date(signIn.createdDateTime);

  const existingSession = await findOpenSessionForSignIn(user.request_id, user.id, loginTime);

  if (existingSession) {
    return heartbeatUsageSession({
      sessionId: existingSession.id,
      userId: user.id,
      signInId,
      azureUserId,
      requestId: user.request_id
    });
  }

  if (signInId && (await isSignInAlreadyProcessed(signInId))) {
    const nearbyOpenSession = await findOpenSessionForSignIn(user.request_id, user.id, loginTime);
    if (
      nearbyOpenSession &&
      isSignInNearOpenSession(
        loginTime,
        nearbyOpenSession.login_at,
        getSignInSessionProximityMs()
      )
    ) {
      return heartbeatUsageSession({
        sessionId: nearbyOpenSession.id,
        userId: user.id,
        signInId,
        azureUserId,
        requestId: user.request_id
      });
    }
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
  } else if (result.action === 'heartbeat' && signInId) {
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

    const orderedSignIns = [...signIns.value].sort(
      (left, right) =>
        new Date(left.createdDateTime).getTime() - new Date(right.createdDateTime).getTime()
    );

    for (const signIn of orderedSignIns) {
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

      const requestResult = await db.query(
        `
          SELECT enable_daily_usage, daily_limit_minutes, usage_schedule
          FROM requests
          WHERE id = $1
        `,
        [session.request_id]
      );

      const request = requestResult.rows[0];
      const timezone = await resolveTrackingTimezone(session.request_id, request);
      const trackingDate = DateTime.now().setZone(timezone).toISODate();

      const limitTrackingResult = await db.query(
        `
          SELECT limit_reached, limit_reached_at
          FROM daily_usage_tracking
          WHERE azure_user_id = $1
            AND tracking_date = $2
          LIMIT 1
        `,
        [session.user_id, trackingDate]
      );
      const limitTracking = limitTrackingResult.rows[0] || null;
      const limitReached = limitTracking?.limit_reached === true;

      const { closeAt, durationMins, endedReason } = resolveStaleSessionClose({
        loginAt,
        lastSeenAt: lastSeen,
        now: new Date(),
        limitReached,
        limitReachedAt: limitTracking?.limit_reached_at || null
      });

      await db.query(
        `
          UPDATE user_usage_sessions
          SET
            logout_at = $1,
            minutes_used = $2,
            ended_reason = $3
          WHERE id = $4
        `,
        [closeAt, durationMins, endedReason, session.id]
      );

      const closedMinutesToday = await getClosedSessionMinutesToday(
        session.user_id,
        trackingDate,
        timezone
      );

      await db.query(
        `
          UPDATE azure_users
          SET used_today_minutes = $1
          WHERE id = $2 AND request_id = $3
        `,
        [Math.round(closedMinutesToday), session.user_id, session.request_id]
      );

      if (limitReached) {
        await db.query(
          `
            INSERT INTO daily_usage_tracking
              (request_id, azure_user_id, tracking_date, consumed_minutes, limit_reached, limit_reached_at)
            VALUES ($1, $2, $3, $4, TRUE, COALESCE($5, NOW()))
            ON CONFLICT (azure_user_id, tracking_date)
            DO UPDATE SET
              consumed_minutes = GREATEST(
                COALESCE(daily_usage_tracking.consumed_minutes, 0),
                EXCLUDED.consumed_minutes
              ),
              limit_reached = TRUE,
              limit_reached_at = COALESCE(
                daily_usage_tracking.limit_reached_at,
                EXCLUDED.limit_reached_at
              ),
              updated_at = NOW()
          `,
          [
            session.request_id,
            session.user_id,
            trackingDate,
            closedMinutesToday,
            limitTracking?.limit_reached_at || null
          ]
        );
      } else {
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
          [session.request_id, session.user_id, trackingDate, closedMinutesToday]
        );
      }

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
        `[SIGNIN_MONITOR] Closed stale session for ${session.username} — ${durationMins}m this session, ${Math.round(closedMinutesToday)}m total today (closed)`
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
  createGraphClient,
  findOpenSessionForSignIn,
  heartbeatUsageSession,
  handleActiveSignIn,
  openUsageSession,
  loadTrackedUsers,
  isUniqueOpenSessionViolation: require('../utils/openSessionConstraint').isUniqueOpenSessionViolation
};
