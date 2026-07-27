const { DateTime } = require('luxon');

const DEFAULT_LAB_EXPIRY_END_TIME = process.env.LAB_EXPIRY_END_TIME || '18:00';
const DEFAULT_LAB_EXPIRY_TIMEZONE = process.env.LAB_EXPIRY_TIMEZONE || 'Asia/Kolkata';

const parseLocalEndTime = (timeValue) => {
  const raw = String(timeValue || DEFAULT_LAB_EXPIRY_END_TIME).trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);

  if (!match) {
    return { hour: 18, minute: 0 };
  }

  return {
    hour: Math.min(23, Math.max(0, Number(match[1]))),
    minute: Math.min(59, Math.max(0, Number(match[2])))
  };
};

const toDateOnlyString = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return DateTime.fromJSDate(value).toISODate();
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  return text.slice(0, 10);
};

/**
 * Resolve when a lab request actually expires (end of expiry calendar day in lab timezone).
 */
const resolveRequestExpiresAt = ({
  expiryDate,
  expiresAt = null,
  timezone = DEFAULT_LAB_EXPIRY_TIMEZONE,
  endTimeLocal = DEFAULT_LAB_EXPIRY_END_TIME
} = {}) => {
  if (expiresAt) {
    const resolved = DateTime.fromISO(String(expiresAt), { setZone: true });
    return resolved.isValid ? resolved : null;
  }

  const dateOnly = toDateOnlyString(expiryDate);
  if (!dateOnly) {
    return null;
  }

  const { hour, minute } = parseLocalEndTime(endTimeLocal);
  const tz = timezone || DEFAULT_LAB_EXPIRY_TIMEZONE;

  return DateTime.fromISO(dateOnly, { zone: tz }).set({
    hour,
    minute,
    second: 0,
    millisecond: 0
  });
};

const isRequestExpired = (request, at = DateTime.now()) => {
  const expiresAt = resolveRequestExpiresAt({
    expiryDate: request?.expiry_date ?? request?.expiryDate,
    expiresAt: request?.expires_at ?? request?.expiresAt,
    timezone: request?.expiry_timezone ?? request?.timezone,
    endTimeLocal: request?.expiry_end_time ?? request?.windowEndTime
  });

  if (!expiresAt) {
    return false;
  }

  return at.toMillis() > expiresAt.toMillis();
};

const buildExpiresAtFromParts = ({
  expiryDate,
  timezone = DEFAULT_LAB_EXPIRY_TIMEZONE,
  endTimeLocal = DEFAULT_LAB_EXPIRY_END_TIME
}) => {
  const expiresAt = resolveRequestExpiresAt({ expiryDate, timezone, endTimeLocal });
  return expiresAt?.toUTC().toISO() ?? null;
};

module.exports = {
  DEFAULT_LAB_EXPIRY_END_TIME,
  DEFAULT_LAB_EXPIRY_TIMEZONE,
  parseLocalEndTime,
  resolveRequestExpiresAt,
  isRequestExpired,
  buildExpiresAtFromParts
};
