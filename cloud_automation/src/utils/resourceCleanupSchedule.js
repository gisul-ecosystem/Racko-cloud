const { DateTime } = require('luxon');
const AppError = require('./AppError');

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const normalizeCleanupTime = (value) => {
  const normalized = String(value || '').trim();
  if (!TIME_PATTERN.test(normalized)) {
    throw new AppError('resourceCleanupTime must be in HH:MM 24-hour format.', 400);
  }
  return normalized;
};

const normalizeCleanupTimezone = (value, fallback = 'Asia/Kolkata') => {
  const tz = String(value || fallback).trim() || fallback;
  const probe = DateTime.now().setZone(tz);
  if (!probe.isValid) {
    throw new AppError(`Invalid resourceCleanupTimezone: ${tz}`, 400);
  }
  return tz;
};

const computeNextDailyCleanupRunAt = ({
  timeHHMM,
  timezone = 'Asia/Kolkata',
  after = new Date()
}) => {
  const time = normalizeCleanupTime(timeHHMM);
  const tz = normalizeCleanupTimezone(timezone);
  const [hour, minute] = time.split(':').map(Number);
  const afterInZone = DateTime.fromJSDate(after, { zone: tz });

  let candidate = afterInZone.set({
    hour,
    minute,
    second: 0,
    millisecond: 0
  });

  if (candidate <= afterInZone) {
    candidate = candidate.plus({ days: 1 });
  }

  return candidate.toUTC().toISO();
};

const formatCleanupTimeLabel = (timeHHMM) => {
  const time = normalizeCleanupTime(timeHHMM);
  const [hour, minute] = time.split(':').map(Number);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
};

module.exports = {
  computeNextDailyCleanupRunAt,
  formatCleanupTimeLabel,
  normalizeCleanupTime,
  normalizeCleanupTimezone
};
