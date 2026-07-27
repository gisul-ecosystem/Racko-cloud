import { DateTime } from 'luxon';

export function resolveRequestTimezone(request, fallback = 'Asia/Kolkata') {
  return request?.timezone || fallback;
}

/**
 * Parse datetime-local values (YYYY-MM-DDTHH:mm) in the request timezone.
 * Production servers run in UTC, so bare ISO strings must not be treated as UTC
 * when the admin picked a local wall-clock time in the browser.
 */
export function parseServiceDateTime(value, timezone = 'Asia/Kolkata') {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }

  const zoned = DateTime.fromISO(raw, { zone: timezone });
  if (zoned.isValid) {
    return zoned.toUTC().toJSDate();
  }

  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export function formatServiceDateTime(date, timezone = 'Asia/Kolkata') {
  if (!date) {
    return '';
  }

  const parsed = DateTime.fromJSDate(date instanceof Date ? date : new Date(date), {
    zone: 'utc',
  }).setZone(timezone);

  if (!parsed.isValid) {
    return new Date(date).toLocaleString();
  }

  return parsed.toLocaleString(DateTime.DATETIME_MED_WITH_SECONDS);
}
