const { DateTime } = require('luxon');
const db = require('../db/postgres');
const { sumMergedSessionMinutes } = require('../utils/sessionIntervalMerge');
const { createGraphClient } = require('../provisioners/azure/userProvisioner');
const {
  runResourceActionForUser
} = require('./resourceCleanupService');
const { getResourceGroupNameForUser } = require('./userResourceGroupService');
const { getUserEmailFromGraph } = require('./budgetEnforcementService');
const { sendDailyLimitReachedEmail } = require('./email/dailyLimitEmailService');

const logEvent = (level, event, details = {}) => {
  const entry = {
    timestamp: new Date().toISOString(),
    service: 'daily-usage-enforcement',
    level,
    event,
    ...details
  };

  const message = JSON.stringify(entry);

  if (level === 'error') {
    console.error(message);
    return;
  }

  console.log(message);
};

const resolveContactEmail = (username) =>
  String(username || '').includes('@') ? String(username).trim() : null;

const getSessionMergeGapMs = () =>
  Number(process.env.SESSION_MERGE_GAP_MINUTES || 2) * 60 * 1000;

async function loadTodaySessionIntervals(userId, todayDate, timezone, { closedOnly = false } = {}) {
  const tz = timezone || 'Asia/Kolkata';

  const { rows } = await db.query(
    `
      SELECT
        login_at,
        COALESCE(logout_at, NOW()) AS end_at
      FROM user_usage_sessions
      WHERE user_id = $1
        AND DATE(login_at AT TIME ZONE $2) = $3::date
        ${closedOnly ? 'AND logout_at IS NOT NULL' : ''}
      ORDER BY login_at ASC
    `,
    [userId, tz, todayDate]
  );

  return rows.map((row) => ({
    start: new Date(row.login_at),
    end: new Date(row.end_at)
  }));
}

async function getMergedSessionMinutesToday(userId, todayDate, timezone, { closedOnly = false } = {}) {
  const intervals = await loadTodaySessionIntervals(userId, todayDate, timezone, { closedOnly });
  return sumMergedSessionMinutes(intervals, getSessionMergeGapMs());
}

/**
 * Called by the window enforcement scheduler every minute.
 * For each active request with daily limits, checks all users'
 * consumed minutes and blocks + cleans up anyone who exceeded the limit.
 */
async function enforceDailyHourLimits() {
  const { rows: users } = await db.query(`
    SELECT
      au.id AS user_id,
      au.azure_user_id,
      au.username,
      au.request_id,
      au.azure_account_enabled,
      ruw.daily_limit_hours,
      ruw.timezone,
      ruw.window_start_time,
      ruw.window_end_time,
      r.customer_email,
      COALESCE(dut.limit_reached, FALSE) AS limit_reached
    FROM azure_users au
    JOIN requests r ON r.id = au.request_id
    JOIN request_usage_windows ruw ON ruw.request_id = r.id
    LEFT JOIN daily_usage_tracking dut
      ON dut.azure_user_id = au.id
     AND dut.tracking_date = (NOW() AT TIME ZONE COALESCE(ruw.timezone, 'Asia/Kolkata'))::date
    WHERE r.status = 'Completed'
      AND COALESCE(r.expired, FALSE) = FALSE
      AND (r.expires_at IS NULL OR r.expires_at >= NOW())
      AND ruw.daily_limit_hours IS NOT NULL
      AND ruw.day_of_week = EXTRACT(DOW FROM NOW() AT TIME ZONE ruw.timezone)
      AND au.azure_user_id IS NOT NULL
      AND COALESCE(au.is_deleted, FALSE) = FALSE
      AND au.azure_account_enabled = TRUE
      AND (
        au.window_enforcement_paused_until IS NULL
        OR au.window_enforcement_paused_until <= NOW()
      )
  `);

  for (const user of users) {
    try {
      const limitMinutes = Math.round(Number(user.daily_limit_hours) * 60);
      const timezone = user.timezone || 'Asia/Kolkata';
      const todayDate = new Date().toLocaleDateString('en-CA', { timeZone: timezone });
      const consumedMinutes = await getConsumedMinutesToday(user.user_id, todayDate, timezone);

      console.log(
        `[Enforcement] ${user.username}: ${consumedMinutes.toFixed(1)}m consumed / ${limitMinutes}m limit`
      );

      if (consumedMinutes < limitMinutes) {
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
          [user.request_id, user.user_id, todayDate, consumedMinutes]
        );
        continue;
      }

      // Re-enforce if Azure is still enabled even when limit_reached was set on a prior failed attempt
      if (user.limit_reached && !user.azure_account_enabled) {
        continue;
      }

      console.log(`[Enforcement] LIMIT REACHED for ${user.username} — enforcing block`);
      await handleLimitReached({
        requestId: user.request_id,
        userId: user.user_id,
        azureUserId: user.azure_user_id,
        username: user.username,
        todayDate,
        dailyLimitHours: Number(user.daily_limit_hours),
        consumedMinutes,
        customerEmail: user.customer_email,
        limitMinutes
      });
    } catch (err) {
      console.error(`[Enforcement] Error for ${user.username}:`, err.message);
      logEvent('error', 'enforcement_user_error', {
        userId: user.user_id,
        username: user.username,
        error: err.message
      });
    }
  }
}

async function enforceForRequest(requestId, timezone) {
  const tz = timezone || 'Asia/Kolkata';
  const nowInTz = DateTime.now().setZone(tz);
  const todayDate = nowInTz.toISODate();
  const dayOfWeek = nowInTz.weekday % 7;

  const { rows: windowRows } = await db.query(
    `
      SELECT daily_limit_hours, window_start_time, window_end_time
      FROM request_usage_windows
      WHERE request_id = $1
        AND day_of_week = $2
        AND daily_limit_hours IS NOT NULL
    `,
    [requestId, dayOfWeek]
  );

  if (!windowRows.length) {
    return;
  }

  const { daily_limit_hours: dailyLimitHours } = windowRows[0];
  const limitMinutes = Math.round(Number(dailyLimitHours) * 60);

  const { rows: users } = await db.query(
    `
      SELECT
        au.id AS user_id,
        au.azure_user_id,
        au.username,
        au.azure_account_enabled,
        COALESCE(dut.consumed_minutes, 0) AS consumed_minutes,
        COALESCE(dut.limit_reached, FALSE) AS limit_reached,
        r.customer_email
      FROM azure_users au
      JOIN requests r ON r.id = au.request_id
      LEFT JOIN daily_usage_tracking dut
        ON dut.azure_user_id = au.id
       AND dut.tracking_date = $1
      WHERE au.request_id = $2
        AND au.azure_user_id IS NOT NULL
        AND COALESCE(au.is_deleted, FALSE) = FALSE
        AND au.azure_account_enabled = TRUE
    `,
    [todayDate, requestId]
  );

  for (const user of users) {
    const consumedMinutes = await getConsumedMinutesToday(user.user_id, todayDate, tz);

    if (consumedMinutes < limitMinutes) {
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
        [requestId, user.user_id, todayDate, consumedMinutes]
      );
      continue;
    }

    if (user.limit_reached && !user.azure_account_enabled) {
      continue;
    }

    await handleLimitReached({
      requestId,
      userId: user.user_id,
      azureUserId: user.azure_user_id,
      username: user.username,
      todayDate,
      dailyLimitHours: Number(dailyLimitHours),
      consumedMinutes,
      customerEmail: user.customer_email,
      limitMinutes
    });
  }
}

/**
 * Sums closed session time for a user on a given date (in the correct timezone).
 */
async function getClosedSessionMinutesToday(userId, todayDate, timezone) {
  return getMergedSessionMinutesToday(userId, todayDate, timezone, { closedOnly: true });
}

/**
 * Sums all session time for a user on a given date (in the correct timezone).
 * Merges overlapping intervals before summing so duplicate sessions are not double-counted.
 */
async function getConsumedMinutesToday(userId, todayDate, timezone) {
  return getMergedSessionMinutesToday(userId, todayDate, timezone, { closedOnly: false });
}

async function handleLimitReached({
  requestId,
  userId,
  azureUserId,
  username,
  todayDate,
  dailyLimitHours,
  consumedMinutes,
  customerEmail,
  limitMinutes
}) {
  const resolvedLimitMinutes = limitMinutes ?? Math.round(Number(dailyLimitHours) * 60);

  console.log(
    `[Enforcement] handleLimitReached: ${username} — ${consumedMinutes.toFixed(1)}m / ${resolvedLimitMinutes}m`
  );

  logEvent('info', 'daily_limit_reached', {
    requestId,
    userId,
    todayDate,
    consumedMinutes: consumedMinutes.toFixed(2),
    limitMinutes: resolvedLimitMinutes
  });

  // STEP 1: Close ALL open sessions for this user immediately
  const closedSessions = await db.query(
    `
      UPDATE user_usage_sessions
      SET
        logout_at = NOW(),
        minutes_used = EXTRACT(EPOCH FROM (NOW() - login_at)) / 60,
        ended_reason = 'daily_limit_reached'
      WHERE user_id = $1
        AND logout_at IS NULL
      RETURNING id, minutes_used
    `,
    [userId]
  );

  console.log(
    `[Enforcement] Closed ${closedSessions.rowCount} open sessions for ${username}`
  );

  const { graphClient } = createGraphClient();

  // STEP 2: Disable Azure Entra ID account — forces user out of Azure Portal
  try {
    await graphClient
      .api(`/users/${azureUserId}`)
      .patch({ accountEnabled: false });

    console.log(
      `[Enforcement] Azure account DISABLED for ${username} (${azureUserId})`
    );
  } catch (err) {
    console.error(
      `[Enforcement] FAILED to disable Azure account for ${username}:`,
      err.message
    );
    logEvent('error', 'disable_account_failed', { userId, error: err.message });
  }

  // STEP 3: Revoke all Azure sign-in sessions (forces immediate browser logout)
  try {
    await graphClient.api(`/users/${azureUserId}/revokeSignInSessions`).post({});
    console.log(`[Enforcement] Azure sign-in sessions REVOKED for ${username}`);
  } catch (err) {
    console.error(
      `[Enforcement] Failed to revoke sign-in sessions for ${username}:`,
      err.message
    );
    logEvent('error', 'revoke_sessions_failed', { userId, error: err.message });
  }

  // STEP 4: Update daily_usage_tracking — mark limit reached
  await db.query(
    `
      INSERT INTO daily_usage_tracking
        (request_id, azure_user_id, tracking_date, consumed_minutes, limit_reached, limit_reached_at)
      VALUES ($1, $2, $3, $4, TRUE, NOW())
      ON CONFLICT (azure_user_id, tracking_date)
      DO UPDATE SET
        consumed_minutes = EXCLUDED.consumed_minutes,
        limit_reached = TRUE,
        limit_reached_at = NOW(),
        updated_at = NOW()
    `,
    [requestId, userId, todayDate, Math.round(consumedMinutes)]
  );

  // STEP 5: Update azure_users table
  await db.query(
    `
      UPDATE azure_users
      SET
        status = 'Blocked',
        azure_account_enabled = FALSE,
        blocked_reason = 'daily_limit_reached',
        blocked_at = NOW()
      WHERE id = $1
    `,
    [userId]
  );

  console.log(`[Enforcement] DB updated — ${username} status = Blocked`);

  // STEP 6: Resource cleanup on limit
  try {
    const { rows: reqRows } = await db.query(
      `
        SELECT costing_mode, azure_resource_group_name, resource_cleanup_action
        FROM requests
        WHERE id = $1
      `,
      [requestId]
    );
    const req = reqRows[0];
    const resourceGroupName = await getResourceGroupNameForUser(requestId, userId);
    const resolvedAction = req?.resource_cleanup_action === 'pause' ? 'pause' : 'delete';
    const affected = await runResourceActionForUser({
      costingMode: req?.costing_mode,
      perUserResourceGroupName: resourceGroupName,
      sharedResourceGroupName: req?.azure_resource_group_name,
      entraObjectId: azureUserId,
      action: resolvedAction
    });

    if (affected.length || resourceGroupName || req?.azure_resource_group_name) {
      await db.query(
        `
          INSERT INTO resource_cleanup_logs
            (request_id, ran_at, resources_deleted, user_count, status, triggered_by, total_deleted)
          VALUES ($1, NOW(), $2, 1, 'success', 'daily_limit', $3)
        `,
        [requestId, JSON.stringify(affected), affected.length]
      );

      logEvent('info', 'resource_cleanup_on_limit', {
        userId,
        action: resolvedAction,
        resourceGroupName: resourceGroupName || req?.azure_resource_group_name,
        affectedCount: affected.length
      });
    }
  } catch (err) {
    logEvent('error', 'resource_cleanup_on_limit_failed', {
      userId,
      error: err.message
    });
  }

  // STEP 7: Send email notification
  try {
    const recipientEmail =
      customerEmail || resolveContactEmail(username) || (await getUserEmailFromGraph(azureUserId));

    if (recipientEmail) {
      await sendDailyLimitReachedEmail({
        to: recipientEmail,
        dailyLimitHours,
        consumedMinutes
      });
    } else {
      logEvent('error', 'limit_email_skipped', {
        userId,
        reason: 'missing_user_email'
      });
    }
  } catch (err) {
    console.error(`[Enforcement] Email failed for ${username}:`, err.message);
    logEvent('error', 'limit_email_failed', {
      userId,
      error: err.message
    });
  }
}

module.exports = {
  enforceDailyHourLimits,
  enforceForRequest,
  getConsumedMinutesToday,
  getClosedSessionMinutesToday,
  getMergedSessionMinutesToday,
  loadTodaySessionIntervals
};
