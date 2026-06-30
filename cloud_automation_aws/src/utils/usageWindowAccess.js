import { DateTime } from 'luxon';
import { magicLinkSessionSeconds } from './magicLinkSession.js';
import {
  getTodayWindowForRequest,
  getUserDailyLimitState,
} from './provisionedUsers.js';

const AWS_MIN_STS_SECONDS = 900;

export function sumConsumedMinutesToday(sessions, todayDate, timezone) {
  const dayStart = DateTime.fromISO(todayDate, { zone: timezone }).startOf('day');
  const dayEnd = dayStart.endOf('day');

  let total = 0;
  for (const session of sessions) {
    const loginAt = DateTime.fromJSDate(new Date(session.loginAt)).setZone(timezone);
    if (loginAt < dayStart || loginAt > dayEnd) {
      continue;
    }

    const logoutAt = session.logoutAt
      ? DateTime.fromJSDate(new Date(session.logoutAt)).setZone(timezone)
      : DateTime.now().setZone(timezone);

    total += logoutAt.diff(loginAt, 'minutes').minutes;
  }

  return Math.max(0, total);
}

export function getRequestTimezone(request) {
  const windows = request.usageWindows || [];
  return windows[0]?.timezone || request.timezone || 'Asia/Kolkata';
}

export function isWithinUsageWindow(request, nowInTz = DateTime.now()) {
  const todayWindow = getTodayWindowForRequest(request, nowInTz);
  if (!todayWindow) {
    return false;
  }

  const currentTime = nowInTz.toFormat('HH:mm');
  const start =
    todayWindow.windowStartTime ??
    todayWindow.window_start_time ??
    todayWindow.startTime;
  const end =
    todayWindow.windowEndTime ?? todayWindow.window_end_time ?? todayWindow.endTime;

  return currentTime >= start && currentTime < end;
}

export function getDailyLimitHours(request, nowInTz = DateTime.now()) {
  const todayWindow = getTodayWindowForRequest(request, nowInTz);
  if (!todayWindow) {
    return null;
  }
  return todayWindow.dailyLimitHours ?? todayWindow.daily_limit_hours ?? null;
}

export function getConsumedMinutesTodayForUser(request, userId, timezone) {
  const nowInTz = DateTime.now().setZone(timezone);
  const todayDate = nowInTz.toISODate();
  const userSessions = (request.usageSessions || []).filter(
    (session) => session.userId === userId
  );
  return sumConsumedMinutesToday(userSessions, todayDate, timezone);
}

export function getRemainingMinutesToday(request, userId, at = new Date()) {
  const timezone = getRequestTimezone(request);
  const nowInTz = DateTime.fromJSDate(at instanceof Date ? at : new Date(at)).setZone(timezone);
  const dailyLimitHours = getDailyLimitHours(request, nowInTz);
  if (dailyLimitHours == null) {
    return null;
  }

  const consumed = getConsumedMinutesTodayForUser(request, userId, timezone);
  return Math.max(0, dailyLimitHours * 60 - consumed);
}

export function getMinutesUntilWindowEnd(request, nowInTz = DateTime.now()) {
  const todayWindow = getTodayWindowForRequest(request, nowInTz);
  if (!todayWindow) {
    return null;
  }

  const end =
    todayWindow.windowEndTime ?? todayWindow.window_end_time ?? todayWindow.endTime;
  if (!end) {
    return null;
  }

  const [hours, minutes] = end.split(':').map(Number);
  const windowEnd = nowInTz.set({
    hour: hours,
    minute: minutes,
    second: 0,
    millisecond: 0,
  });

  if (windowEnd <= nowInTz) {
    return 0;
  }

  return windowEnd.diff(nowInTz, 'minutes').minutes;
}

export function computeMagicLinkDurationSeconds(request, userId, at = new Date()) {
  const hasDailyLimits =
    request.enableDailyUsage || (request.usageWindows || []).length > 0;
  if (!hasDailyLimits) {
    return magicLinkSessionSeconds();
  }

  const timezone = getRequestTimezone(request);
  const nowInTz = DateTime.fromJSDate(at instanceof Date ? at : new Date(at)).setZone(timezone);

  if ((request.usageWindows || []).length && !isWithinUsageWindow(request, nowInTz)) {
    return 0;
  }

  const remainingMinutes = getRemainingMinutesToday(request, userId, at);
  const untilWindowEnd = getMinutesUntilWindowEnd(request, nowInTz);

  let capMinutes = remainingMinutes;
  if (untilWindowEnd != null) {
    capMinutes =
      capMinutes != null ? Math.min(capMinutes, untilWindowEnd) : untilWindowEnd;
  }

  if (capMinutes != null && capMinutes <= 0) {
    return 0;
  }

  const defaultSeconds = magicLinkSessionSeconds();
  if (capMinutes == null) {
    return defaultSeconds;
  }

  const cappedSeconds = Math.ceil(capMinutes * 60);
  const effectiveSeconds = Math.max(AWS_MIN_STS_SECONDS, cappedSeconds);
  return Math.min(defaultSeconds, effectiveSeconds);
}

export function isDailyHourLimitReached(request, userId, nowInTz = DateTime.now()) {
  const state = getUserDailyLimitState(request, userId);
  if (state?.dailyLimitReached) {
    return true;
  }

  const dailyLimitHours = getDailyLimitHours(request, nowInTz);
  if (dailyLimitHours == null) {
    return false;
  }

  const timezone = getRequestTimezone(request);
  const consumedMinutes = getConsumedMinutesTodayForUser(request, userId, timezone);
  return consumedMinutes >= dailyLimitHours * 60;
}

export function evaluateDailyUsageAccess(request, userId, at = new Date()) {
  if (!request.enableDailyUsage && !(request.usageWindows || []).length) {
    return { allowed: true, reason: 'ok', message: null };
  }

  const timezone = getRequestTimezone(request);
  const nowInTz = DateTime.fromJSDate(at instanceof Date ? at : new Date(at)).setZone(timezone);

  if ((request.usageWindows || []).length && !isWithinUsageWindow(request, nowInTz)) {
    return {
      allowed: false,
      reason: 'outside_window',
      message: 'Lab access is only available during your scheduled usage window.',
    };
  }

  if (isDailyHourLimitReached(request, userId, nowInTz)) {
    return {
      allowed: false,
      reason: 'limit_reached',
      message: 'Daily usage limit reached. Access will reset at midnight.',
    };
  }

  return { allowed: true, reason: 'ok', message: null };
}
