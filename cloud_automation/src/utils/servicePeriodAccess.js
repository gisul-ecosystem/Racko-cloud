const { formatServiceDateTime, resolveRequestTimezone } = require('./serviceDateTime');
const { resolveRequestExpiresAt } = require('./requestExpiry');

function accessError(message, statusCode = 403) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function evaluateServicePeriodAccess(request, at = new Date()) {
  const timezone = resolveRequestTimezone(request);
  const startsAtRaw = request?.starts_at ?? request?.startsAt ?? null;
  const start = startsAtRaw ? new Date(startsAtRaw) : null;

  const expiresAt = resolveRequestExpiresAt({
    expiryDate: request?.expiry_date ?? request?.expiryDate,
    expiresAt: request?.expires_at ?? request?.expiresAt,
    timezone: request?.expiry_timezone ?? request?.timezone,
    endTimeLocal: request?.expiry_end_time ?? request?.windowEndTime
  });
  const end = expiresAt?.isValid ? expiresAt.toJSDate() : null;

  const now = at instanceof Date ? at : new Date(at);

  if (start && !Number.isNaN(start.getTime()) && now < start) {
    return {
      allowed: false,
      reason: 'before_start',
      message: `Lab access opens on ${formatServiceDateTime(start, timezone)}.`,
      startsAt: start,
      endsAt: end
    };
  }

  if (end && !Number.isNaN(end.getTime()) && now > end) {
    return {
      allowed: false,
      reason: 'after_end',
      message: 'Lab access has expired.',
      startsAt: start,
      endsAt: end
    };
  }

  return {
    allowed: true,
    reason: 'ok',
    message: null,
    startsAt: start,
    endsAt: end
  };
}

function assertConsoleAccessAllowed(request, at = new Date()) {
  const access = evaluateServicePeriodAccess(request, at);
  if (!access.allowed) {
    throw accessError(access.message);
  }
  return access;
}

function isRequestWithinServicePeriod(request, at = new Date()) {
  return evaluateServicePeriodAccess(request, at).allowed;
}

module.exports = {
  evaluateServicePeriodAccess,
  assertConsoleAccessAllowed,
  isRequestWithinServicePeriod
};
