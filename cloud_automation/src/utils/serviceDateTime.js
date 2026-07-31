const { DateTime } = require('luxon');

function resolveRequestTimezone(request, fallback = 'Asia/Kolkata') {
  return request?.timezone || fallback;
}

/**
 * Parse datetime-local values (YYYY-MM-DDTHH:mm) in the request timezone.
 */
function parseServiceDateTime(value, timezone = 'Asia/Kolkata') {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }

  const zoned = DateTime.fromISO(raw, { zone: timezone });
  if (zoned.isValid) {
    return zoned.toUTC().toISO();
  }

  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString();
}

function formatServiceDateTime(date, timezone = 'Asia/Kolkata') {
  if (!date) {
    return '';
  }

  const parsed = DateTime.fromISO(String(date), { setZone: true }).setZone(timezone);
  if (!parsed.isValid) {
    return new Date(date).toLocaleString();
  }

  return parsed.toLocaleString(DateTime.DATETIME_MED_WITH_SECONDS);
}

module.exports = {
  resolveRequestTimezone,
  parseServiceDateTime,
  formatServiceDateTime
};
