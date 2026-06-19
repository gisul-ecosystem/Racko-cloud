const { DateTime } = require('luxon');
const db = require('../db/postgres');
const { createGraphClient } = require('../provisioners/azure/userProvisioner');
const {
  deleteResourcesInsideRG,
  deleteUserResourcesInSharedRG
} = require('./resourceCleanupService');
const { isPerUserCosting } = require('../utils/costingMode');
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

/**
 * Called by the window enforcement scheduler every minute.
 * For each active request with daily limits, checks all users'
 * consumed minutes and blocks + cleans up anyone who exceeded the limit.
 */
async function enforceDailyHourLimits() {
  const { rows: requests } = await db.query(
    `
      SELECT DISTINCT
        pr.id AS request_id,
        ruw.timezone
      FROM requests pr
      JOIN request_usage_windows ruw
        ON ruw.request_id = pr.id
       AND ruw.daily_limit_hours IS NOT NULL
      WHERE pr.status = 'Completed'
        AND COALESCE(pr.expired, FALSE) = FALSE
        AND pr.expiry_date >= NOW()
    `
  );

  for (const req of requests) {
    await enforceForRequest(req.request_id, req.timezone);
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
  const limitMinutes = dailyLimitHours * 60;

  const { rows: users } = await db.query(
    `
      SELECT
        au.id AS user_id,
        au.azure_user_id,
        au.username,
        au.azure_account_enabled,
        COALESCE(dut.consumed_minutes, 0) AS consumed_minutes,
        COALESCE(dut.limit_reached, FALSE) AS limit_reached
      FROM azure_users au
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
    if (user.limit_reached) {
      continue;
    }

    const consumedMinutes = await getConsumedMinutesToday(user.user_id, todayDate, tz);

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

    if (consumedMinutes >= limitMinutes) {
      await handleLimitReached({
        requestId,
        userId: user.user_id,
        azureUserId: user.azure_user_id,
        username: user.username,
        todayDate,
        dailyLimitHours,
        consumedMinutes
      });
    }
  }
}

/**
 * Sums all session time for a user on a given date (in the correct timezone).
 * Uses logout_at if closed, NOW() if session is still open.
 */
async function getConsumedMinutesToday(userId, todayDate, timezone) {
  const tz = timezone || 'Asia/Kolkata';
  const dayStart = DateTime.fromISO(todayDate, { zone: tz }).startOf('day').toUTC().toISO();
  const dayEnd = DateTime.fromISO(todayDate, { zone: tz }).endOf('day').toUTC().toISO();

  const { rows } = await db.query(
    `
      SELECT
        COALESCE(SUM(
          EXTRACT(EPOCH FROM (
            COALESCE(logout_at, NOW()) - login_at
          )) / 60
        ), 0) AS total_minutes
      FROM user_usage_sessions
      WHERE user_id = $1
        AND login_at >= $2
        AND login_at < $3
    `,
    [userId, dayStart, dayEnd]
  );

  return parseFloat(rows[0]?.total_minutes ?? 0);
}

async function handleLimitReached({
  requestId,
  userId,
  azureUserId,
  username,
  todayDate,
  dailyLimitHours,
  consumedMinutes
}) {
  logEvent('info', 'daily_limit_reached', {
    requestId,
    userId,
    todayDate,
    consumedMinutes: consumedMinutes.toFixed(2),
    limitMinutes: (dailyLimitHours * 60).toFixed(2)
  });

  try {
    const { graphClient } = createGraphClient();
    await graphClient
      .api(`/users/${azureUserId}`)
      .patch({ accountEnabled: false });

    await db.query(
      `
        UPDATE azure_users
        SET azure_account_enabled = FALSE
        WHERE id = $1
      `,
      [userId]
    );
  } catch (err) {
    logEvent('error', 'block_failed', {
      userId,
      error: err.message
    });
  }

  await db.query(
    `
      UPDATE daily_usage_tracking
      SET limit_reached = TRUE,
          limit_reached_at = NOW(),
          updated_at = NOW()
      WHERE azure_user_id = $1
        AND tracking_date = $2
    `,
    [userId, todayDate]
  );

  await db.query(
    `
      UPDATE user_usage_sessions
      SET logout_at = NOW()
      WHERE user_id = $1
        AND logout_at IS NULL
    `,
    [userId]
  );

  try {
    const { rows: reqRows } = await db.query(
      `
        SELECT costing_mode, azure_resource_group_name
        FROM requests
        WHERE id = $1
      `,
      [requestId]
    );
    const req = reqRows[0];
    const resourceGroupName = await getResourceGroupNameForUser(requestId, userId);
    let deleted = [];

    if (isPerUserCosting(req?.costing_mode) && resourceGroupName) {
      deleted = await deleteResourcesInsideRG(resourceGroupName);
    } else if (req?.azure_resource_group_name && azureUserId) {
      deleted = await deleteUserResourcesInSharedRG(
        req.azure_resource_group_name,
        azureUserId
      );
    }

    if (deleted.length || resourceGroupName || req?.azure_resource_group_name) {
      await db.query(
        `
          INSERT INTO resource_cleanup_logs
            (request_id, ran_at, resources_deleted, user_count, status)
          VALUES ($1, NOW(), $2, 1, 'success')
        `,
        [requestId, JSON.stringify(deleted)]
      );

      logEvent('info', 'resource_cleanup_on_limit', {
        userId,
        resourceGroupName: resourceGroupName || req?.azure_resource_group_name,
        deletedCount: deleted.length
      });
    }
  } catch (err) {
    logEvent('error', 'resource_cleanup_on_limit_failed', {
      userId,
      error: err.message
    });
  }

  try {
    const recipientEmail = resolveContactEmail(username) || (await getUserEmailFromGraph(azureUserId));

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
    logEvent('error', 'limit_email_failed', {
      userId,
      error: err.message
    });
  }
}

module.exports = {
  enforceDailyHourLimits,
  enforceForRequest,
  getConsumedMinutesToday
};
