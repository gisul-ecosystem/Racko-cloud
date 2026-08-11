/**
 * Shared assignment-window schedule for elastic-server (ExternalVM) assignments.
 * Used by both ExternalVmTenantAssignment and ExternalVmUserAssignment.
 */
import { Schema } from 'mongoose';
import {
  calendarDateInTimezone,
  clockTimeInTimezone,
} from '../vmAutomation/timezoneUtils';

export const DEFAULT_ASSIGNMENT_TIMEZONE = 'Asia/Kolkata';

/** 0 = Sunday … 6 = Saturday (JS getDay() convention). */
export interface AssignmentSchedule {
  effectiveFrom: Date;
  effectiveTo: Date | null;
  daysOfWeek: number[];
  /** Daily window start, "HH:mm" (24h) in `timezone`. */
  dailyStart: string;
  /** Daily window end, "HH:mm" (24h) in `timezone`. */
  dailyEnd: string;
  timezone: string;
}

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const assignmentScheduleSchema = new Schema<AssignmentSchedule>(
  {
    effectiveFrom: { type: Date, required: true },
    effectiveTo: { type: Date, default: null },
    daysOfWeek: {
      type: [Number],
      required: true,
      validate: {
        validator: (days: number[]) =>
          Array.isArray(days) &&
          days.length > 0 &&
          days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6),
        message: 'daysOfWeek must be non-empty integers 0–6 (Sun–Sat)',
      },
    },
    dailyStart: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (v: string) => HHMM_RE.test(v),
        message: 'dailyStart must be HH:mm',
      },
    },
    dailyEnd: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (v: string) => HHMM_RE.test(v),
        message: 'dailyEnd must be HH:mm',
      },
    },
    timezone: {
      type: String,
      required: true,
      trim: true,
      default: DEFAULT_ASSIGNMENT_TIMEZONE,
    },
  },
  { _id: false }
);

function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function weekdayInTimezone(date: Date, timezone: string): number {
  // en-US weekday short → map to 0–6
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).format(date);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[name] ?? date.getUTCDay();
}

/**
 * Whether `now` falls inside the schedule window.
 * Missing / null schedule → allowed (existing unrestricted assignments).
 */
export function isAccessAllowedNow(
  schedule?: AssignmentSchedule | null,
  now: Date = new Date()
): boolean {
  if (!schedule) return true;

  const tz = schedule.timezone || DEFAULT_ASSIGNMENT_TIMEZONE;
  const todayStr = calendarDateInTimezone(now, tz);
  const fromStr = calendarDateInTimezone(schedule.effectiveFrom, tz);
  if (todayStr < fromStr) return false;

  if (schedule.effectiveTo) {
    const toStr = calendarDateInTimezone(schedule.effectiveTo, tz);
    if (todayStr > toStr) return false;
  }

  const dow = weekdayInTimezone(now, tz);
  if (!schedule.daysOfWeek.includes(dow)) return false;

  const nowMins = minutesOfDay(clockTimeInTimezone(now, tz));
  const startMins = minutesOfDay(schedule.dailyStart);
  const endMins = minutesOfDay(schedule.dailyEnd);

  // Same-day window; overnight windows (end < start) span midnight.
  if (endMins >= startMins) {
    return nowMins >= startMins && nowMins < endMins;
  }
  return nowMins >= startMins || nowMins < endMins;
}

function addCalendarDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + days));
  return dt.toISOString().slice(0, 10);
}

/**
 * Milliseconds until the next daily window end for this schedule, or null if
 * none within ~2 weeks / past effectiveTo. Used to arm disconnect timers.
 */
export function msUntilNextWindowEnd(
  schedule: AssignmentSchedule,
  now: Date = new Date()
): number | null {
  const tz = schedule.timezone || DEFAULT_ASSIGNMENT_TIMEZONE;
  const fromStr = calendarDateInTimezone(schedule.effectiveFrom, tz);
  const toStr = schedule.effectiveTo
    ? calendarDateInTimezone(schedule.effectiveTo, tz)
    : '9999-12-31';
  const todayStr = calendarDateInTimezone(now, tz);
  const nowMins = minutesOfDay(clockTimeInTimezone(now, tz));
  const startMins = minutesOfDay(schedule.dailyStart);
  const endMins = minutesOfDay(schedule.dailyEnd);
  const overnight = endMins < startMins;

  // Currently inside an overnight evening segment → end is tomorrow morning.
  if (overnight && isAccessAllowedNow(schedule, now) && nowMins >= startMins) {
    const delayMins = 24 * 60 - nowMins + endMins;
    return delayMins > 0 ? delayMins * 60 * 1000 : null;
  }

  for (let offset = 0; offset < 16; offset++) {
    const dayStr = addCalendarDays(todayStr, offset);
    if (dayStr < fromStr) continue;
    if (dayStr > toStr) return null;

    const probe = new Date(`${dayStr}T12:00:00.000Z`);
    if (!schedule.daysOfWeek.includes(weekdayInTimezone(probe, tz))) continue;

    if (!overnight) {
      if (offset === 0 && nowMins >= endMins) continue;
      const delayMins = offset * 24 * 60 + (endMins - nowMins);
      if (delayMins <= 0) continue;
      return delayMins * 60 * 1000;
    }

    // Overnight: window ends at dailyEnd on this calendar morning.
    if (offset === 0 && nowMins >= endMins) continue;
    const delayMins = offset * 24 * 60 + (endMins - nowMins);
    if (delayMins <= 0) continue;
    return delayMins * 60 * 1000;
  }

  return null;
}

/**
 * Human-readable next open window for denial messages, or null if none within
 * ~2 weeks / past effectiveTo. Missing schedule → null (always allowed).
 */
export function getNextAllowedAccessHint(
  schedule?: AssignmentSchedule | null,
  now: Date = new Date()
): string | null {
  if (!schedule) return null;

  const tz = schedule.timezone || DEFAULT_ASSIGNMENT_TIMEZONE;
  const fromStr = calendarDateInTimezone(schedule.effectiveFrom, tz);
  const toStr = schedule.effectiveTo
    ? calendarDateInTimezone(schedule.effectiveTo, tz)
    : '9999-12-31';
  const todayStr = calendarDateInTimezone(now, tz);
  const startDate = todayStr < fromStr ? fromStr : todayStr;
  const startMins = minutesOfDay(schedule.dailyStart);
  const endMins = minutesOfDay(schedule.dailyEnd);
  const overnight = endMins < startMins;
  const nowMins = minutesOfDay(clockTimeInTimezone(now, tz));

  for (let offset = 0; offset < 14; offset++) {
    const dayStr = addCalendarDays(startDate, offset);
    if (dayStr > toStr) return null;

    const probe = new Date(`${dayStr}T12:00:00.000Z`);
    const dow = weekdayInTimezone(probe, tz);
    if (!schedule.daysOfWeek.includes(dow)) continue;

    if (offset === 0 && dayStr === todayStr) {
      // Still before today's window opens
      if (!overnight && nowMins < startMins) {
        return `${dayStr} ${schedule.dailyStart}–${schedule.dailyEnd} (${tz})`;
      }
      if (overnight && nowMins >= endMins && nowMins < startMins) {
        return `${dayStr} ${schedule.dailyStart}–${schedule.dailyEnd} (${tz})`;
      }
      // Today's window already passed (or we're denied for another reason mid-window) → next day
      continue;
    }

    return `${dayStr} ${schedule.dailyStart}–${schedule.dailyEnd} (${tz})`;
  }

  return null;
}

/**
 * True when two schedules could both grant access on some overlapping day/time.
 * Date ranges must intersect (YYYY-MM-DD in each schedule's timezone); then a
 * shared weekday and overlapping daily HH:mm windows are required.
 */
export function schedulesOverlap(a: AssignmentSchedule, b: AssignmentSchedule): boolean {
  const aTz = a.timezone || DEFAULT_ASSIGNMENT_TIMEZONE;
  const bTz = b.timezone || DEFAULT_ASSIGNMENT_TIMEZONE;

  const aFrom = calendarDateInTimezone(a.effectiveFrom, aTz);
  const bFrom = calendarDateInTimezone(b.effectiveFrom, bTz);
  const aTo = a.effectiveTo ? calendarDateInTimezone(a.effectiveTo, aTz) : '9999-12-31';
  const bTo = b.effectiveTo ? calendarDateInTimezone(b.effectiveTo, bTz) : '9999-12-31';

  // Date ranges must intersect
  if (aFrom > bTo || bFrom > aTo) return false;

  // Shared weekday
  const sharedDays = a.daysOfWeek.filter((d) => b.daysOfWeek.includes(d));
  if (sharedDays.length === 0) return false;

  // Daily time windows overlap (handle overnight)
  const aStart = minutesOfDay(a.dailyStart);
  const aEnd = minutesOfDay(a.dailyEnd);
  const bStart = minutesOfDay(b.dailyStart);
  const bEnd = minutesOfDay(b.dailyEnd);

  const aOvernight = aEnd < aStart;
  const bOvernight = bEnd < bStart;

  // Expand overnight into two segments for overlap test
  const segments = (start: number, end: number, overnight: boolean): Array<[number, number]> => {
    if (!overnight) return [[start, end]];
    return [
      [start, 24 * 60],
      [0, end],
    ];
  };

  const aSegs = segments(aStart, aEnd, aOvernight);
  const bSegs = segments(bStart, bEnd, bOvernight);

  for (const [as, ae] of aSegs) {
    for (const [bs, be] of bSegs) {
      if (as < be && bs < ae) return true;
    }
  }

  return false;
}
