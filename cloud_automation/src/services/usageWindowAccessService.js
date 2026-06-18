const { DateTime } = require('luxon');
const db = require('../db/postgres');

/**
 * Returns true when the request uses request_usage_windows (new window system).
 */
async function requestHasUsageWindows(requestId) {
  const { rows } = await db.query(
    `
      SELECT 1
      FROM request_usage_windows
      WHERE request_id = $1
      LIMIT 1
    `,
    [requestId]
  );

  return rows.length > 0;
}

/**
 * Whether a user has already hit their daily hour limit today (usage window system).
 */
async function isDailyHourLimitReachedToday(userId, timezone) {
  const tz = timezone || 'Asia/Kolkata';
  const todayDate = DateTime.now().setZone(tz).toISODate();

  const { rows } = await db.query(
    `
      SELECT 1
      FROM daily_usage_tracking
      WHERE azure_user_id = $1
        AND tracking_date = $2
        AND limit_reached = TRUE
      LIMIT 1
    `,
    [userId, todayDate]
  );

  return rows.length > 0;
}

/**
 * Load usage windows for a request (cached per monitor run).
 */
async function loadUsageWindowsByRequest(requestIds) {
  if (!requestIds.length) {
    return new Map();
  }

  const { rows } = await db.query(
    `
      SELECT
        request_id,
        day_of_week,
        window_start_time,
        window_end_time,
        timezone,
        daily_limit_hours
      FROM request_usage_windows
      WHERE request_id = ANY($1)
    `,
    [requestIds]
  );

  const windowsByRequest = new Map();

  for (const row of rows) {
    const list = windowsByRequest.get(row.request_id) || [];
    list.push(row);
    windowsByRequest.set(row.request_id, list);
  }

  return windowsByRequest;
}

/**
 * Check whether `at` falls inside today's configured usage window for a request.
 */
function isWithinUsageWindow(windows, at = new Date()) {
  if (!Array.isArray(windows) || windows.length === 0) {
    return true;
  }

  const tz = windows[0].timezone || 'Asia/Kolkata';
  const now = DateTime.fromJSDate(at instanceof Date ? at : new Date(at)).setZone(tz);
  const currentDay = now.weekday % 7;
  const currentTime = now.toFormat('HH:mm:ss');
  const todayWindow = windows.find((window) => window.day_of_week === currentDay);

  if (!todayWindow) {
    return false;
  }

  const startTime = String(todayWindow.window_start_time).slice(0, 8);
  const endTime = String(todayWindow.window_end_time).slice(0, 8);

  return currentTime >= startTime && currentTime < endTime;
}

module.exports = {
  requestHasUsageWindows,
  isDailyHourLimitReachedToday,
  loadUsageWindowsByRequest,
  isWithinUsageWindow
};
