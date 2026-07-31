const { DateTime } = require('luxon');
const db = require('../db/postgres');
const { getConsumedMinutesToday } = require('./dailyUsageEnforcementService');
const { computeWindowAccessState, getBlockedReasonLabel } = require('../utils/windowAccessState');
const {
  getTodayWindow,
  isWithinUsageWindowTime
} = require('../utils/usageWindowTime');
const { evaluateCombinedLabAccess } = require('../utils/labAccess');

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

  return isWithinUsageWindowTime(windows, at);
}

function getTodayWindowConfig(windows, at = new Date()) {
  if (!Array.isArray(windows) || windows.length === 0) {
    return null;
  }

  const tz = windows[0].timezone || 'Asia/Kolkata';
  const now = DateTime.fromJSDate(at instanceof Date ? at : new Date(at)).setZone(tz);
  const todayWindow = getTodayWindow(windows, at);

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

async function batchLoadDailyLimitFlags(userIds, todayDate) {
  if (!userIds.length) {
    return new Map();
  }

  const { rows } = await db.query(
    `
      SELECT azure_user_id, limit_reached
      FROM daily_usage_tracking
      WHERE azure_user_id = ANY($1::int[])
        AND tracking_date = $2
    `,
    [userIds, todayDate]
  );

  return new Map(rows.map((row) => [Number(row.azure_user_id), row.limit_reached === true]));
}

function evaluateWindowDailyLimitAccessSync({
  request = null,
  windows,
  consumedMinutes,
  limitReachedInDb = false,
  at = new Date()
}) {
  if (request) {
    const labAccess = evaluateCombinedLabAccess(request, windows, at);
    if (!labAccess.allowed && labAccess.reason !== 'limit_exceeded') {
      return {
        allowed: false,
        reason: labAccess.reason,
        consumedMinutes: 0,
        limitMinutes: null,
        remainingMinutes: 0,
        limitReached: false,
        blockedForToday: true,
        blockedReason: labAccess.blockedReason,
        blockedReasonLabel: labAccess.blockedReasonLabel,
        withinWindow: labAccess.withinUsageWindow === true,
        todayWindow: getTodayWindow(windows, at),
        timezone: windows[0]?.timezone || 'Asia/Kolkata',
        message: labAccess.message
      };
    }
  }

  const config = getTodayWindowConfig(windows, at);
  const withinWindow = config?.todayWindow ? isWithinUsageWindow(windows, at) : false;
  const limitMinutes =
    config?.dailyLimitHours != null ? Math.round(config.dailyLimitHours * 60) : null;

  return computeWindowAccessState({
    config,
    withinWindow,
    consumedMinutes,
    limitMinutes,
    limitReachedInDb
  });
}

async function evaluateWindowDailyLimitAccessBatch({
  request = null,
  userIds,
  windows,
  consumedMinutesByUser,
  at = new Date()
}) {
  if (request) {
    const labAccess = evaluateCombinedLabAccess(request, windows, at);
    if (!labAccess.allowed && labAccess.reason !== 'limit_exceeded') {
      const blockedAccess = {
        allowed: false,
        reason: labAccess.reason,
        consumedMinutes: 0,
        limitMinutes: null,
        remainingMinutes: 0,
        limitReached: false,
        blockedForToday: true,
        blockedReason: labAccess.blockedReason,
        blockedReasonLabel: labAccess.blockedReasonLabel,
        withinWindow: labAccess.withinUsageWindow === true,
        todayWindow: getTodayWindow(windows, at),
        timezone: windows[0]?.timezone || 'Asia/Kolkata',
        message: labAccess.message
      };
      return new Map(userIds.map((userId) => [Number(userId), blockedAccess]));
    }
  }

  const config = getTodayWindowConfig(windows, at);
  const limitFlags =
    config?.todayWindow && userIds.length
      ? await batchLoadDailyLimitFlags(userIds, config.todayDate)
      : new Map();

  const withinWindow = config?.todayWindow ? isWithinUsageWindow(windows, at) : false;
  const limitMinutes =
    config?.dailyLimitHours != null ? Math.round(config.dailyLimitHours * 60) : null;

  const accessByUser = new Map();

  for (const userId of userIds) {
    const normalizedUserId = Number(userId);
    accessByUser.set(
      normalizedUserId,
      computeWindowAccessState({
        config,
        withinWindow,
        consumedMinutes: Number(consumedMinutesByUser.get(normalizedUserId) || 0),
        limitMinutes,
        limitReachedInDb: limitFlags.get(normalizedUserId) === true
      })
    );
  }

  return accessByUser;
}

async function evaluateWindowDailyLimitAccess({ requestId, userId, windows, request = null, at = new Date() }) {
  if (!request && requestId) {
    const { rows } = await db.query(
      `SELECT starts_at, expires_at, expiry_date FROM requests WHERE id = $1 LIMIT 1`,
      [requestId]
    );
    request = rows[0] || null;
  }

  const labAccess = request ? evaluateCombinedLabAccess(request, windows, at) : { allowed: true };
  if (!labAccess.allowed && labAccess.reason !== 'limit_exceeded') {
    return {
      allowed: false,
      reason: labAccess.reason,
      consumedMinutes: 0,
      limitMinutes: null,
      remainingMinutes: 0,
      limitReached: false,
      blockedForToday: true,
      blockedReason: labAccess.blockedReason,
      blockedReasonLabel: labAccess.blockedReasonLabel,
      withinWindow: labAccess.withinUsageWindow === true,
      todayWindow: getTodayWindow(windows, at),
      timezone: windows[0]?.timezone || 'Asia/Kolkata',
      message: labAccess.message
    };
  }

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
  evaluateWindowDailyLimitAccess,
  evaluateWindowDailyLimitAccessBatch,
  evaluateWindowDailyLimitAccessSync
};
