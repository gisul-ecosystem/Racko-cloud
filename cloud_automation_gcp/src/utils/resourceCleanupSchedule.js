import { DateTime } from 'luxon';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function normalizeCleanupTime(value) {
  const normalized = String(value || '').trim();
  if (!TIME_PATTERN.test(normalized)) {
    const error = new Error('resourceCleanupTime must be in HH:MM 24-hour format.');
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

export function normalizeCleanupTimezone(value, fallback = 'Asia/Kolkata') {
  const tz = String(value || fallback).trim() || fallback;
  const probe = DateTime.now().setZone(tz);
  if (!probe.isValid) {
    const error = new Error(`Invalid resourceCleanupTimezone: ${tz}`);
    error.statusCode = 400;
    throw error;
  }
  return tz;
}

export function computeNextDailyCleanupRunAt({
  timeHHMM,
  timezone = 'Asia/Kolkata',
  after = new Date(),
}) {
  const time = normalizeCleanupTime(timeHHMM);
  const tz = normalizeCleanupTimezone(timezone);
  const [hour, minute] = time.split(':').map(Number);
  const afterInZone = DateTime.fromJSDate(after, { zone: tz });

  let candidate = afterInZone.set({
    hour,
    minute,
    second: 0,
    millisecond: 0,
  });

  if (candidate <= afterInZone) {
    candidate = candidate.plus({ days: 1 });
  }

  return candidate.toUTC().toJSDate();
}

export function isValidCleanupTime(value) {
  return Boolean(value && TIME_PATTERN.test(String(value).trim()));
}
