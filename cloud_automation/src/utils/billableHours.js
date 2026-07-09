const { DateTime } = require('luxon');

const parseTimeToMinutes = (value) => {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
};

const normalizeUsageWindows = (usageWindows) => {
  if (!Array.isArray(usageWindows)) {
    return [];
  }

  return usageWindows
    .map((window) => ({
      day_of_week: Number(window?.day_of_week),
      window_start_time: String(window?.window_start_time || '').trim(),
      window_end_time: String(window?.window_end_time || '').trim(),
      timezone: String(window?.timezone || '').trim() || 'Asia/Kolkata',
      daily_limit_hours:
        window?.daily_limit_hours != null ? Number(window.daily_limit_hours) : null
    }))
    .filter(
      (window) =>
        Number.isInteger(window.day_of_week) &&
        window.day_of_week >= 0 &&
        window.day_of_week <= 6 &&
        window.window_start_time &&
        window.window_end_time
    );
};

const luxonWeekdayToDayOfWeek = (weekday) => Number(weekday) % 7;

const computeWindowHoursForDay = (window) => {
  const startMinutes = parseTimeToMinutes(window.window_start_time);
  const endMinutes = parseTimeToMinutes(window.window_end_time);

  if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) {
    return 0;
  }

  let hours = (endMinutes - startMinutes) / 60;

  if (Number.isFinite(window.daily_limit_hours) && window.daily_limit_hours > 0) {
    hours = Math.min(hours, window.daily_limit_hours);
  }

  return hours;
};

const computeBillableHours = (startDate, endDate, usageWindows = []) => {
  const start = DateTime.fromJSDate(startDate instanceof Date ? startDate : new Date(startDate));
  const end = DateTime.fromJSDate(endDate instanceof Date ? endDate : new Date(endDate));

  if (!start.isValid || !end.isValid || end < start) {
    return {
      calendarHours: 1,
      billableHours: 1,
      usesUsageWindows: false
    };
  }

  const calendarHours = Math.max(1, end.diff(start, 'hours').hours);
  const normalizedWindows = normalizeUsageWindows(usageWindows);

  if (normalizedWindows.length === 0) {
    return {
      calendarHours: Number(calendarHours.toFixed(2)),
      billableHours: Number(calendarHours.toFixed(2)),
      usesUsageWindows: false
    };
  }

  const timezone = normalizedWindows[0].timezone || 'Asia/Kolkata';
  const windowsByDay = new Map(
    normalizedWindows.map((window) => [window.day_of_week, window])
  );

  const rangeStart = start.setZone(timezone);
  const rangeEnd = end.setZone(timezone);
  let cursor = rangeStart.startOf('day');
  let billableHours = 0;

  while (cursor <= rangeEnd.endOf('day')) {
    const dayOfWeek = luxonWeekdayToDayOfWeek(cursor.weekday);
    const window = windowsByDay.get(dayOfWeek);

    if (window) {
      const dayHours = computeWindowHoursForDay(window);
      if (dayHours > 0) {
        const dayStart = cursor.set({
          hour: parseTimeToMinutes(window.window_start_time) / 60,
          minute: parseTimeToMinutes(window.window_start_time) % 60,
          second: 0,
          millisecond: 0
        });
        const dayEnd = cursor.set({
          hour: parseTimeToMinutes(window.window_end_time) / 60,
          minute: parseTimeToMinutes(window.window_end_time) % 60,
          second: 0,
          millisecond: 0
        });

        const effectiveStart = DateTime.max(rangeStart, dayStart);
        const effectiveEnd = DateTime.min(rangeEnd, dayEnd);

        if (effectiveEnd > effectiveStart) {
          let hours = effectiveEnd.diff(effectiveStart, 'hours').hours;
          if (Number.isFinite(window.daily_limit_hours) && window.daily_limit_hours > 0) {
            hours = Math.min(hours, window.daily_limit_hours);
          }
          billableHours += hours;
        }
      }
    }

    cursor = cursor.plus({ days: 1 });
  }

  return {
    calendarHours: Number(calendarHours.toFixed(2)),
    billableHours: Number(Math.max(1, billableHours).toFixed(2)),
    usesUsageWindows: true
  };
};

module.exports = {
  computeBillableHours,
  normalizeUsageWindows
};
