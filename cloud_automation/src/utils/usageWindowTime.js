const { DateTime } = require('luxon');

function normalizeTimeToComparable(value) {
  if (!value) {
    return '00:00:00';
  }

  if (value instanceof Date) {
    return DateTime.fromJSDate(value).toFormat('HH:mm:ss');
  }

  const text = String(value).trim();
  const match = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) {
    return '00:00:00';
  }

  const hour = String(Math.min(23, Math.max(0, Number(match[1])))).padStart(2, '0');
  const minute = String(Math.min(59, Math.max(0, Number(match[2])))).padStart(2, '0');
  const second = String(Math.min(59, Math.max(0, Number(match[3] || 0)))).padStart(2, '0');
  return `${hour}:${minute}:${second}`;
}

function luxonWeekdayToDayOfWeek(weekday) {
  return Number(weekday) % 7;
}

function getTodayWindow(windows, at = new Date()) {
  if (!Array.isArray(windows) || windows.length === 0) {
    return null;
  }

  const tz = windows[0].timezone || 'Asia/Kolkata';
  const now = DateTime.fromJSDate(at instanceof Date ? at : new Date(at)).setZone(tz);
  const currentDay = luxonWeekdayToDayOfWeek(now.weekday);

  return (
    windows.find((window) => Number(window.day_of_week) === currentDay) || null
  );
}

function isWithinUsageWindowTime(windows, at = new Date()) {
  const todayWindow = getTodayWindow(windows, at);
  if (!todayWindow) {
    return false;
  }

  const tz = windows[0].timezone || 'Asia/Kolkata';
  const now = DateTime.fromJSDate(at instanceof Date ? at : new Date(at)).setZone(tz);
  const currentTime = now.toFormat('HH:mm:ss');
  const startTime = normalizeTimeToComparable(todayWindow.window_start_time);
  const endTime = normalizeTimeToComparable(todayWindow.window_end_time);

  return currentTime >= startTime && currentTime < endTime;
}

function normalizeWindowTimeForDb(value) {
  return normalizeTimeToComparable(value);
}

module.exports = {
  normalizeTimeToComparable,
  luxonWeekdayToDayOfWeek,
  getTodayWindow,
  isWithinUsageWindowTime,
  normalizeWindowTimeForDb
};
