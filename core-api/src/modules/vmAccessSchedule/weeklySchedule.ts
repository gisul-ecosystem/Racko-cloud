import {
  calendarDateInTimezone,
  clockTimeInTimezone,
} from '../vmAutomation/timezoneUtils';

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export type WeekdayName = (typeof WEEKDAY_NAMES)[number];

export interface ScheduleWindow {
  start: string; // HH:MM
  end: string; // HH:MM
}

export interface WeeklyScheduleDay {
  day: WeekdayName;
  enabled: boolean;
  windows: ScheduleWindow[];
}

export interface WeeklyAccessResult {
  allowed: boolean;
  reason?: string;
  nextWindow?: string | null;
  error?: string;
}

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function windowsOverlap(a: ScheduleWindow, b: ScheduleWindow): boolean {
  const aStart = minutesOfDay(a.start);
  const aEnd = minutesOfDay(a.end);
  const bStart = minutesOfDay(b.start);
  const bEnd = minutesOfDay(b.end);
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Validate weekly schedule JSON contract.
 * Returns list of human-readable errors (empty = valid).
 */
export function validateWeeklySchedule(input: unknown): string[] {
  const errors: string[] = [];

  if (!Array.isArray(input)) {
    return ['weeklySchedule must be an array of 7 day entries'];
  }

  if (input.length !== 7) {
    errors.push(`weeklySchedule must contain exactly 7 entries (got ${input.length})`);
  }

  const seen = new Set<string>();

  for (let i = 0; i < input.length; i++) {
    const entry = input[i] as Record<string, unknown> | null;
    const prefix = `weeklySchedule[${i}]`;

    if (!entry || typeof entry !== 'object') {
      errors.push(`${prefix} must be an object`);
      continue;
    }

    const day = entry.day;
    if (typeof day !== 'string' || !(WEEKDAY_NAMES as readonly string[]).includes(day)) {
      errors.push(`${prefix}.day must be one of ${WEEKDAY_NAMES.join(', ')}`);
    } else if (seen.has(day)) {
      errors.push(`Duplicate day "${day}" in weeklySchedule`);
    } else {
      seen.add(day);
    }

    if (typeof entry.enabled !== 'boolean') {
      errors.push(`${prefix}.enabled must be a boolean`);
    }

    if (!Array.isArray(entry.windows)) {
      errors.push(`${prefix}.windows must be an array`);
      continue;
    }

    const windows = entry.windows as unknown[];
    for (let w = 0; w < windows.length; w++) {
      const win = windows[w] as Record<string, unknown> | null;
      const wPrefix = `${prefix}.windows[${w}]`;
      if (!win || typeof win !== 'object') {
        errors.push(`${wPrefix} must be an object`);
        continue;
      }
      if (typeof win.start !== 'string' || !HHMM_RE.test(win.start)) {
        errors.push(`${wPrefix}.start must be HH:MM (24h)`);
      }
      if (typeof win.end !== 'string' || !HHMM_RE.test(win.end)) {
        errors.push(`${wPrefix}.end must be HH:MM (24h)`);
      }
      if (
        typeof win.start === 'string' &&
        typeof win.end === 'string' &&
        HHMM_RE.test(win.start) &&
        HHMM_RE.test(win.end)
      ) {
        if (minutesOfDay(win.start) >= minutesOfDay(win.end)) {
          errors.push(`${wPrefix}: start must be before end (no midnight crossing)`);
        }
      }
    }

    // Overlap check among valid windows
    const validWins = windows.filter((raw): raw is ScheduleWindow => {
      const win = raw as ScheduleWindow;
      return (
        typeof win?.start === 'string' &&
        typeof win?.end === 'string' &&
        HHMM_RE.test(win.start) &&
        HHMM_RE.test(win.end) &&
        minutesOfDay(win.start) < minutesOfDay(win.end)
      );
    });
    for (let a = 0; a < validWins.length; a++) {
      for (let b = a + 1; b < validWins.length; b++) {
        if (windowsOverlap(validWins[a], validWins[b])) {
          errors.push(`${prefix}: windows must not overlap`);
          a = validWins.length;
          break;
        }
      }
    }
  }

  for (const name of WEEKDAY_NAMES) {
    if (!seen.has(name) && input.length === 7) {
      errors.push(`Missing day "${name}" in weeklySchedule`);
    }
  }

  return errors;
}

function weekdayNameInTimezone(date: Date, timeZone: string): WeekdayName {
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
  }).format(date);
  return name as WeekdayName;
}

function addCalendarDays(yyyyMmDd: string, days: number): string {
  const d = new Date(`${yyyyMmDd}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekdayIndex(name: WeekdayName): number {
  return WEEKDAY_NAMES.indexOf(name);
}

/**
 * Find the next open window within ≤7 days (inclusive of later today).
 */
export function getNextOpenWindow(
  schedule: WeeklyScheduleDay[],
  timeZone: string,
  now: Date = new Date()
): string | null {
  const byDay = new Map(schedule.map((d) => [d.day, d]));
  const todayName = weekdayNameInTimezone(now, timeZone);
  const todayDate = calendarDateInTimezone(now, timeZone);
  const nowMins = minutesOfDay(clockTimeInTimezone(now, timeZone));
  const startIdx = weekdayIndex(todayName);

  for (let offset = 0; offset < 7; offset++) {
    const dayName = WEEKDAY_NAMES[(startIdx + offset) % 7];
    const entry = byDay.get(dayName);
    if (!entry?.enabled || !entry.windows?.length) continue;

    const dateStr = addCalendarDays(todayDate, offset);
    const sorted = [...entry.windows].sort(
      (a, b) => minutesOfDay(a.start) - minutesOfDay(b.start)
    );

    for (const win of sorted) {
      if (offset === 0 && minutesOfDay(win.end) <= nowMins) continue;
      if (offset === 0 && minutesOfDay(win.start) <= nowMins && nowMins < minutesOfDay(win.end)) {
        // currently inside — next window is still "now" for messaging? skip to next after current
        continue;
      }
      if (offset === 0 && minutesOfDay(win.start) <= nowMins) continue;
      return `${dayName} ${dateStr} ${win.start}–${win.end} (${timeZone})`;
    }
  }

  return null;
}

/**
 * Evaluate weekly schedule access for "now" in IANA timezone.
 * Window match: start inclusive, end exclusive.
 */
export function checkWeeklyAccess(
  schedule: WeeklyScheduleDay[],
  timeZone: string = 'Asia/Kolkata',
  now: Date = new Date()
): WeeklyAccessResult {
  const tz = timeZone || 'Asia/Kolkata';
  const byDay = new Map(schedule.map((d) => [d.day, d]));
  const dayName = weekdayNameInTimezone(now, tz);
  const entry = byDay.get(dayName);
  const nextWindow = () => getNextOpenWindow(schedule, tz, now);

  if (!entry || !entry.enabled || !entry.windows?.length) {
    return {
      allowed: false,
      reason: 'weekly_day_closed',
      error: `Access denied: ${dayName} is outside the weekly schedule.`,
      nextWindow: nextWindow(),
    };
  }

  const nowMins = minutesOfDay(clockTimeInTimezone(now, tz));
  for (const win of entry.windows) {
    const start = minutesOfDay(win.start);
    const end = minutesOfDay(win.end);
    if (nowMins >= start && nowMins < end) {
      return { allowed: true, reason: 'weekly_window' };
    }
  }

  return {
    allowed: false,
    reason: 'weekly_outside_window',
    error: `Access denied: outside allowed windows for ${dayName}.`,
    nextWindow: nextWindow(),
  };
}
