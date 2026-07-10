const cron = require('node-cron');
const { DateTime } = require('luxon');
const db = require('../db/postgres');
const { createGraphClient } = require('../provisioners/azure/userProvisioner');
const { enforceDailyHourLimits } = require('../services/dailyUsageEnforcementService');

let scheduledTask = null;

const logEvent = (level, event, details = {}) => {
  const entry = {
    timestamp: new Date().toISOString(),
    service: 'window-enforcement-scheduler',
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

async function setEntraUsersEnabled(graphClient, users, enabled) {
  for (const user of users) {
    try {
      await graphClient
        .api(`/users/${user.azure_user_id}`)
        .patch({ accountEnabled: enabled });
    } catch (err) {
      if (err.statusCode === 404) {
        continue;
      }

      logEvent('error', 'entra_update_failed', {
        azureUserId: user.azure_user_id,
        error: err.message
      });
    }
  }
}

async function enforceWindowForRequest(requestId) {
  const { rows: windows } = await db.query(
    `
      SELECT day_of_week, window_start_time, window_end_time, timezone
      FROM request_usage_windows
      WHERE request_id = $1
    `,
    [requestId]
  );

  if (!windows.length) {
    return;
  }

  const tz = windows[0].timezone || 'Asia/Kolkata';
  const now = DateTime.now().setZone(tz);
  const currentDay = now.weekday % 7;
  const currentTime = now.toFormat('HH:mm:ss');
  const todayWindow = windows.find((window) => window.day_of_week === currentDay);

  const shouldBeUnblocked = Boolean(
    todayWindow
      && currentTime >= todayWindow.window_start_time
      && currentTime < todayWindow.window_end_time
  );

  const { rows: users } = await db.query(
    `
      SELECT id, azure_user_id, azure_account_enabled, window_enforcement_paused_until
      FROM azure_users
      WHERE request_id = $1
        AND azure_user_id IS NOT NULL
        AND COALESCE(is_deleted, FALSE) = FALSE
    `,
    [requestId]
  );

  const enforcementPausedUsers = users.filter(
    (user) =>
      user.window_enforcement_paused_until
      && new Date(user.window_enforcement_paused_until).getTime() > Date.now()
  );

  if (enforcementPausedUsers.length === users.length) {
    return;
  }

  const eligibleUsers = users.filter(
    (user) =>
      !user.window_enforcement_paused_until
      || new Date(user.window_enforcement_paused_until).getTime() <= Date.now()
  );

  if (!eligibleUsers.length) {
    const pausedButDisabled = enforcementPausedUsers.filter(
      (user) => user.azure_account_enabled === false
    );

    if (pausedButDisabled.length) {
      const { graphClient } = createGraphClient();
      await setEntraUsersEnabled(graphClient, pausedButDisabled, true);
      await db.query(
        `
          UPDATE azure_users
          SET azure_account_enabled = TRUE
          WHERE id = ANY($1)
        `,
        [pausedButDisabled.map((user) => user.id)]
      );
      logEvent('info', 'users_reenabled_admin_pause', {
        requestId,
        count: pausedButDisabled.length
      });
    }

    return;
  }

  const usersToBlock = eligibleUsers.filter(
    (user) => user.azure_account_enabled !== false && !shouldBeUnblocked
  );
  const usersToUnblock = eligibleUsers.filter(
    (user) => user.azure_account_enabled === false && shouldBeUnblocked
  );

  if (!usersToBlock.length && !usersToUnblock.length) {
    return;
  }

  const { graphClient } = createGraphClient();

  if (usersToBlock.length) {
    await setEntraUsersEnabled(graphClient, usersToBlock, false);
    await db.query(
      `
        UPDATE azure_users
        SET azure_account_enabled = FALSE
        WHERE id = ANY($1)
      `,
      [usersToBlock.map((user) => user.id)]
    );
    await db.query(
      `
        INSERT INTO window_enforcement_logs (request_id, action, user_count, status)
        VALUES ($1, 'block', $2, 'success')
      `,
      [requestId, usersToBlock.length]
    );
    logEvent('info', 'users_blocked', {
      requestId,
      count: usersToBlock.length,
      reason: 'window_closed'
    });
  }

  if (usersToUnblock.length) {
    const todayDate = DateTime.now().setZone(tz).toISODate();
    const eligibleToUnblock = [];

    for (const user of usersToUnblock) {
      const { rows: trackRows } = await db.query(
        `
          SELECT limit_reached, tracking_date::text AS tracking_date
          FROM daily_usage_tracking
          WHERE azure_user_id = $1
          ORDER BY tracking_date DESC
          LIMIT 1
        `,
        [user.id]
      );

      const lastTracking = trackRows[0];

      if (lastTracking?.limit_reached && lastTracking?.tracking_date === todayDate) {
        logEvent('info', 'skip_unblock_limit_reached_today', {
          userId: user.id,
          date: todayDate
        });
        continue;
      }

      eligibleToUnblock.push(user);
    }

    if (eligibleToUnblock.length) {
      await setEntraUsersEnabled(graphClient, eligibleToUnblock, true);
      await db.query(
        `
          UPDATE azure_users
          SET azure_account_enabled = TRUE
          WHERE id = ANY($1)
        `,
        [eligibleToUnblock.map((user) => user.id)]
      );
      await db.query(
        `
          INSERT INTO window_enforcement_logs (request_id, action, user_count, status)
          VALUES ($1, 'unblock', $2, 'success')
        `,
        [requestId, eligibleToUnblock.length]
      );
      logEvent('info', 'users_unblocked', {
        requestId,
        count: eligibleToUnblock.length,
        reason: 'window_opened_new_day'
      });
    }
  }
}

async function enforceUsageWindows() {
  const { rows: requests } = await db.query(
    `
      SELECT DISTINCT pr.id
      FROM requests pr
      JOIN request_usage_windows ruw ON ruw.request_id = pr.id
      WHERE pr.status = 'Completed'
        AND COALESCE(pr.expired, FALSE) = FALSE
        AND pr.expiry_date >= NOW()
    `
  );

  for (const req of requests) {
    await enforceWindowForRequest(req.id);
  }
}

function startWindowEnforcementScheduler() {
  if (scheduledTask) {
    return;
  }

  scheduledTask = cron.schedule('* * * * *', async () => {
    try {
      await enforceUsageWindows();
      await enforceDailyHourLimits();
    } catch (err) {
      logEvent('error', 'enforcement_poll_error', { error: err.message });
    }
  });

  logEvent('info', 'window_enforcement_scheduler_started');
}

module.exports = {
  startWindowEnforcementScheduler
};
