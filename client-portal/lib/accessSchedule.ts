/** HH:MM 24h */
export interface AccessTimeWindow {
  start: string;
  end: string;
}

export interface AccessWeeklyScheduleDay {
  day: string; // "Monday" … "Sunday"
  enabled: boolean;
  windows: AccessTimeWindow[];
}

/** Read model (includes override — display only on tenant UI) */
export interface AccessSchedule {
  startDate?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  override?: boolean;
  overrideUntil?: string | null;
  timezone?: string | null;
  weeklySchedule?: AccessWeeklyScheduleDay[] | null;
}

/** Write model — no override fields */
export interface AccessScheduleInput {
  startDate?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  timezone?: string | null;
  weeklySchedule?: AccessWeeklyScheduleDay[] | null;
}

export const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export const DEFAULT_ACCESS_TIMEZONE = 'Asia/Kolkata';

export interface WeeklyAccessEditorValue {
  timezone: string;
  startDate: string;
  endDate: string;
  days: AccessWeeklyScheduleDay[];
}

export function createDefaultWeeklyDays(): AccessWeeklyScheduleDay[] {
  return WEEKDAY_NAMES.map((day) => {
    const weekday = day !== 'Saturday' && day !== 'Sunday';
    return {
      day,
      enabled: weekday,
      windows: weekday ? [{ start: '09:00', end: '17:00' }] : [],
    };
  });
}

export function createDefaultWeeklyEditorValue(
  schedule?: AccessSchedule | null
): WeeklyAccessEditorValue {
  const byDay = new Map(
    (schedule?.weeklySchedule ?? []).map((d) => [d.day, d] as const)
  );
  const days =
    schedule?.weeklySchedule && schedule.weeklySchedule.length > 0
      ? WEEKDAY_NAMES.map((day) => {
          const existing = byDay.get(day);
          if (existing) {
            return {
              day,
              enabled: Boolean(existing.enabled),
              windows:
                existing.enabled && existing.windows.length > 0
                  ? existing.windows.map((w) => ({ start: w.start, end: w.end }))
                  : existing.enabled
                    ? [{ start: '09:00', end: '17:00' }]
                    : [],
            };
          }
          return { day, enabled: false, windows: [] };
        })
      : createDefaultWeeklyDays();

  return {
    timezone: schedule?.timezone || DEFAULT_ACCESS_TIMEZONE,
    startDate: schedule?.startDate ?? '',
    endDate: schedule?.endDate ?? '',
    days,
  };
}

/**
 * Always emit full 7-day weeklySchedule + timezone.
 * Disabled days → enabled:false, windows:[].
 * Omit blank startDate/endDate.
 */
export function buildWeeklyAccessSchedule(
  value: WeeklyAccessEditorValue
): AccessScheduleInput {
  const weeklySchedule: AccessWeeklyScheduleDay[] = WEEKDAY_NAMES.map((dayName) => {
    const day = value.days.find((d) => d.day === dayName) ?? {
      day: dayName,
      enabled: false,
      windows: [],
    };
    if (!day.enabled) {
      return { day: dayName, enabled: false, windows: [] };
    }
    const windows = day.windows
      .map((w) => ({ start: w.start.trim(), end: w.end.trim() }))
      .filter((w) => w.start && w.end);
    return {
      day: dayName,
      enabled: true,
      windows: windows.length > 0 ? windows : [{ start: '09:00', end: '17:00' }],
    };
  });

  const input: AccessScheduleInput = {
    timezone: value.timezone || DEFAULT_ACCESS_TIMEZONE,
    weeklySchedule,
  };

  if (value.startDate.trim()) input.startDate = value.startDate.trim();
  if (value.endDate.trim()) input.endDate = value.endDate.trim();

  return input;
}

/** Map API / tenant list shape → AccessSchedule */
export function toAccessSchedule(
  raw: AccessSchedule | Record<string, unknown> | null | undefined
): AccessSchedule | null {
  if (!raw) return null;

  const r = raw as Record<string, unknown>;
  const startDateRaw = r.startDate ?? r.accessStartDate;
  const endDateRaw = r.endDate ?? r.accessEndDate;
  const startDate =
    startDateRaw != null && startDateRaw !== ''
      ? String(startDateRaw).slice(0, 10)
      : null;
  const endDate =
    endDateRaw != null && endDateRaw !== '' ? String(endDateRaw).slice(0, 10) : null;

  const overrideUntilRaw = r.overrideUntil ?? r.accessOverrideUntil;

  return {
    startDate,
    endDate,
    startTime: (r.startTime ?? r.accessStartTime ?? null) as string | null,
    endTime: (r.endTime ?? r.accessEndTime ?? null) as string | null,
    override: Boolean(r.override ?? r.accessOverride ?? false),
    overrideUntil: overrideUntilRaw != null ? String(overrideUntilRaw) : null,
    timezone: (r.timezone ?? r.weeklyScheduleTz ?? DEFAULT_ACCESS_TIMEZONE) as string,
    weeklySchedule: (r.weeklySchedule as AccessWeeklyScheduleDay[] | null | undefined) ?? null,
  };
}

export function formatAccessScheduleDigest(schedule: AccessSchedule | null | undefined): string {
  if (!schedule) return 'No restrictions';

  if (schedule.override) {
    if (schedule.overrideUntil) {
      return `Override until ${new Date(schedule.overrideUntil).toLocaleString()}`;
    }
    return 'Override (permanent)';
  }

  const weekly = schedule.weeklySchedule?.filter((d) => d.enabled && d.windows.length > 0) ?? [];
  if (weekly.length > 0) {
    const parts = weekly.map((d) => {
      const wins = d.windows.map((w) => `${w.start}–${w.end}`).join(', ');
      return `${d.day.slice(0, 3)} ${wins}`;
    });
    const range =
      schedule.startDate || schedule.endDate
        ? ` (${schedule.startDate || '…'} → ${schedule.endDate || '…'})`
        : '';
    return parts.join(' · ') + range;
  }

  if (schedule.startTime || schedule.endTime || schedule.startDate || schedule.endDate) {
    const bits: string[] = [];
    if (schedule.startDate || schedule.endDate) {
      bits.push(`${schedule.startDate || '…'} → ${schedule.endDate || '…'}`);
    }
    if (schedule.startTime || schedule.endTime) {
      bits.push(`${schedule.startTime || '00:00'}–${schedule.endTime || '23:59'}`);
    }
    return bits.join(' · ') || 'Scheduled';
  }

  return 'No restrictions';
}

export type AccessScheduleStatusTone = 'green' | 'amber' | 'red' | 'gray';

export interface AccessScheduleStatus {
  label: string;
  tone: AccessScheduleStatusTone;
  reason: string;
}

function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function clockInTz(now: Date, timeZone: string): { dayName: string; minutes: number; dateStr: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const dayName = get('weekday');
  const hour = Number(get('hour'));
  const minute = Number(get('minute'));
  const dateStr = `${get('year')}-${get('month')}-${get('day')}`;
  return { dayName, minutes: hour * 60 + minute, dateStr };
}

function isOverrideActive(schedule: AccessSchedule, now: Date): boolean {
  if (!schedule.override) return false;
  if (!schedule.overrideUntil) return true;
  return new Date(schedule.overrideUntil).getTime() > now.getTime();
}

/**
 * Client-side status helper — priority mirrors backend:
 * override → weekly → legacy → unrestricted
 */
export function getAccessScheduleStatus(
  schedule: AccessSchedule | null | undefined,
  now: Date = new Date()
): AccessScheduleStatus {
  if (!schedule) {
    return { label: 'No restrictions', tone: 'gray', reason: 'no_restrictions' };
  }

  if (isOverrideActive(schedule, now)) {
    return {
      label: schedule.overrideUntil ? 'Override active' : 'Override active',
      tone: 'amber',
      reason: schedule.overrideUntil ? 'override_until' : 'override_permanent',
    };
  }

  const tz = schedule.timezone || DEFAULT_ACCESS_TIMEZONE;
  const clock = clockInTz(now, tz);

  if (schedule.startDate && clock.dateStr < schedule.startDate) {
    return { label: 'Access not started', tone: 'red', reason: 'before_start_date' };
  }
  if (schedule.endDate && clock.dateStr > schedule.endDate) {
    return { label: 'Access ended', tone: 'red', reason: 'after_end_date' };
  }

  const weekly = schedule.weeklySchedule;
  if (Array.isArray(weekly) && weekly.length > 0) {
    const today = weekly.find((d) => d.day === clock.dayName);
    if (!today || !today.enabled || today.windows.length === 0) {
      return { label: 'Access ended', tone: 'red', reason: 'day_disabled' };
    }
    const inWindow = today.windows.some((w) => {
      const start = minutesOfDay(w.start);
      const end = minutesOfDay(w.end);
      return clock.minutes >= start && clock.minutes < end;
    });
    if (inWindow) {
      return { label: 'Access active', tone: 'green', reason: 'weekly_open' };
    }
    return { label: 'Access ended', tone: 'red', reason: 'outside_window' };
  }

  if (schedule.startTime || schedule.endTime || schedule.startDate || schedule.endDate) {
    if (schedule.startTime && clock.minutes < minutesOfDay(schedule.startTime)) {
      return { label: 'Access ended', tone: 'red', reason: 'before_start_time' };
    }
    if (schedule.endTime && clock.minutes >= minutesOfDay(schedule.endTime)) {
      return { label: 'Access ended', tone: 'red', reason: 'after_end_time' };
    }
    return { label: 'Access active', tone: 'green', reason: 'legacy_window' };
  }

  return { label: 'No restrictions', tone: 'gray', reason: 'no_restrictions' };
}

export function listIanaTimezones(): string[] {
  try {
    const values = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf?.('timeZone');
    if (values?.length) return values;
  } catch {
    /* fall through */
  }
  return [
    'Asia/Kolkata',
    'UTC',
    'America/New_York',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Asia/Dubai',
    'Asia/Singapore',
    'Asia/Tokyo',
    'Australia/Sydney',
  ];
}

/** Format datetime-local value as ISO with offset, e.g. 2026-07-23T17:00:00+05:30 */
export function formatDatetimeLocalWithOffset(
  localValue: string,
  timeZone: string = DEFAULT_ACCESS_TIMEZONE
): string {
  // localValue: YYYY-MM-DDTHH:MM
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localValue)) {
    return localValue;
  }

  const [datePart, timePart] = localValue.split('T');
  // Approximate: use noon UTC on that calendar day to read the zone's GMT offset
  const probe = new Date(`${datePart}T12:00:00.000Z`);
  const tzName =
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
    })
      .formatToParts(probe)
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';

  const match = tzName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  let offset = '+00:00';
  if (match) {
    const sign = match[1];
    const hh = String(match[2]).padStart(2, '0');
    const mm = String(match[3] ?? '00').padStart(2, '0');
    offset = `${sign}${hh}:${mm}`;
  } else if (tzName === 'GMT' || tzName === 'UTC') {
    offset = '+00:00';
  }

  return `${datePart}T${timePart}:00${offset}`;
}
