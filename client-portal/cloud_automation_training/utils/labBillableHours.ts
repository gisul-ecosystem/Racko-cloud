import type { UsageWindow } from '../../cloud_automation/types/catalog';

function parseTimeToMinutes(value: string): number | null {
  const match = String(value || '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

export interface BillableHoursResult {
  calendarHours: number;
  billableHours: number;
  usesUsageWindows: boolean;
}

/**
 * Mirrors cloud_automation billable-hours logic (dates + optional daily windows / limits).
 * Uses local browser time; window timezone is applied as a label only for now.
 */
export function computeLabBillableHours(
  startDateValue: string,
  endDateValue: string,
  usageWindows: UsageWindow[] = []
): BillableHoursResult {
  const start = startDateValue ? new Date(startDateValue) : null;
  const end = endDateValue ? new Date(endDateValue) : null;

  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return { calendarHours: 0, billableHours: 0, usesUsageWindows: false };
  }

  const calendarHours = Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60));
  const windows = (usageWindows || []).filter(
    (window) =>
      Number.isInteger(window.day_of_week) &&
      window.day_of_week >= 0 &&
      window.day_of_week <= 6 &&
      window.window_start_time &&
      window.window_end_time
  );

  if (windows.length === 0) {
    const hours = Number(Math.max(0, calendarHours).toFixed(2));
    return {
      calendarHours: hours,
      billableHours: hours,
      usesUsageWindows: false,
    };
  }

  const byDay = new Map(windows.map((window) => [window.day_of_week, window]));
  let cursor = startOfLocalDay(start);
  const rangeEndDay = startOfLocalDay(end);
  let billableHours = 0;

  while (cursor.getTime() <= rangeEndDay.getTime()) {
    const dayOfWeek = cursor.getDay(); // 0=Sun .. 6=Sat
    const window = byDay.get(dayOfWeek);

    if (window) {
      const startMinutes = parseTimeToMinutes(window.window_start_time);
      const endMinutes = parseTimeToMinutes(window.window_end_time);

      if (startMinutes != null && endMinutes != null && endMinutes > startMinutes) {
        const dayStart = new Date(cursor);
        dayStart.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
        const dayEnd = new Date(cursor);
        dayEnd.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);

        const effectiveStart = maxDate(start, dayStart);
        const effectiveEnd = minDate(end, dayEnd);

        if (effectiveEnd > effectiveStart) {
          let hours = (effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60);
          const dailyLimit =
            window.daily_limit_hours != null ? Number(window.daily_limit_hours) : null;
          if (Number.isFinite(dailyLimit) && dailyLimit != null && dailyLimit > 0) {
            hours = Math.min(hours, dailyLimit);
          }
          billableHours += hours;
        }
      }
    }

    cursor = addDays(cursor, 1);
  }

  return {
    calendarHours: Number(calendarHours.toFixed(2)),
    billableHours: Number(Math.max(0, billableHours).toFixed(2)),
    usesUsageWindows: true,
  };
}

export function formatHoursLabel(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return '—';
  if (hours < 10) return `${hours.toFixed(1)}h`;
  return `${Math.round(hours)}h`;
}
