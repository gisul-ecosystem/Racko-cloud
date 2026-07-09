const { DateTime } = require('luxon');
const db = require('../db/postgres');
const { getConsumedMinutesToday } = require('./dailyUsageEnforcementService');
const { computeWindowAccessState, getBlockedReasonLabel } = require('../utils/windowAccessState');

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
    const requestId = Number(row.request_id);
    const list = windowsByRequest.get(requestId) || [];
    list.push(row);
    windowsByRequest.set(requestId, list);
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

function getTodayWindowConfig(windows, at = new Date()) {
  if (!Array.isArray(windows) || windows.length === 0) {
    return null;
  }

  const tz = windows[0].timezone || 'Asia/Kolkata';
  const now = DateTime.fromJSDate(at instanceof Date ? at : new Date(at)).setZone(tz);
  const currentDay = now.weekday % 7;
  const todayWindow = windows.find((window) => window.day_of_week === currentDay);

  if (!todayWindow) {
    return { timezone: tz, todayDate: now.toISODate(), todayWindow: null };
  }

  return {
    timezone: tz,
    todayDate: now.toISODate(),
    todayWindow,
    dailyLimitHours:
      todayWindow.daily_limit_hours != null ? Number(todayWindow.daily_limit_hours) : null
  };
}

async function evaluateWindowDailyLimitAccess({ requestId, userId, windows, at = new Date() }) {
  const config = getTodayWindowConfig(windows, at);
  const withinWindow = config?.todayWindow ? isWithinUsageWindow(windows, at) : false;
  const limitMinutes =
    config?.dailyLimitHours != null ? Math.round(config.dailyLimitHours * 60) : null;
  const consumedMinutes = config?.todayWindow
    ? await getConsumedMinutesToday(userId, config.todayDate, config.timezone)
    : 0;
  const limitReachedInDb = config?.todayWindow
    ? await isDailyHourLimitReachedToday(userId, config.timezone)
    : false;

  return computeWindowAccessState({
    config,
    withinWindow,
    consumedMinutes,
    limitMinutes,
    limitReachedInDb
  });
}

module.exports = {
  requestHasUsageWindows,
  isDailyHourLimitReachedToday,
  loadUsageWindowsByRequest,
  isWithinUsageWindow,
  getTodayWindowConfig,
  getBlockedReasonLabel,
  computeWindowAccessState,
  evaluateWindowDailyLimitAccess
};
