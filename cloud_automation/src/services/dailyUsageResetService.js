const db = require('../db/postgres');
const { restoreExpiredUsers } = require('./usageEnforcementService');
const { resetDailyCountersIfNeeded } = require('./usageMiddlewareHelper');

/**
 * Reset daily usage counters at midnight and re-enable accounts blocked for daily limits.
 */
async function resetDailyCounters() {
  console.log('[dailyReset] Resetting daily usage counters...');

  const usersResult = await db.query(
    `
      SELECT
        au.id,
        au.request_id,
        au.username,
        au.used_today_minutes,
        au.last_reset_date,
        au.blocked_until,
        au.blocked_reason,
        r.enable_daily_usage,
        r.daily_limit_minutes,
        r.usage_schedule
      FROM azure_users au
      JOIN requests r ON r.id = au.request_id
      WHERE COALESCE(au.is_deleted, false) = false
        AND r.status NOT IN ('Cancelled', 'Expired')
    `
  );

  let resetCount = 0;

  for (const row of usersResult.rows) {
    const beforeDate = row.last_reset_date
      ? new Date(row.last_reset_date).toISOString().split('T')[0]
      : null;
    const refreshed = await resetDailyCountersIfNeeded(row, row, row.id, row.request_id);
    const afterDate = refreshed.last_reset_date
      ? new Date(refreshed.last_reset_date).toISOString().split('T')[0]
      : null;

    if (beforeDate !== afterDate) {
      resetCount += 1;
    }
  }

  await db.query(
    `
      UPDATE azure_users
      SET used_today_minutes = 0,
          blocked_reason = NULL,
          blocked_until = NULL
      WHERE COALESCE(is_deleted, false) = false
        AND blocked_reason = 'daily_limit_reached'
    `
  );

  const restoredCount = await restoreExpiredUsers();

  console.log(
    `[dailyReset] Reset complete — timezone resets=${resetCount}, restored=${restoredCount}`
  );

  return { resetCount, restoredCount };
}

module.exports = {
  resetDailyCounters
};
