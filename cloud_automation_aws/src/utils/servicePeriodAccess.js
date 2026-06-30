function accessError(message, statusCode = 403) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

export function evaluateServicePeriodAccess(request, at = new Date()) {
  const start = request?.startDate ? new Date(request.startDate) : null;
  const end = request?.endDate ? new Date(request.endDate) : null;

  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return {
      allowed: true,
      reason: 'ok',
      message: null,
      startsAt: start,
      endsAt: end,
    };
  }

  const now = at instanceof Date ? at : new Date(at);

  if (now < start) {
    return {
      allowed: false,
      reason: 'before_start',
      message: `Lab access opens on ${start.toLocaleString()}.`,
      startsAt: start,
      endsAt: end,
    };
  }

  if (now > end) {
    return {
      allowed: false,
      reason: 'after_end',
      message: 'Lab access has expired.',
      startsAt: start,
      endsAt: end,
    };
  }

  return {
    allowed: true,
    reason: 'ok',
    message: null,
    startsAt: start,
    endsAt: end,
  };
}

export function assertConsoleAccessAllowed(request, at = new Date()) {
  const access = evaluateServicePeriodAccess(request, at);
  if (!access.allowed) {
    throw accessError(access.message);
  }
  return access;
}

export function isRequestWithinServicePeriod(request, at = new Date()) {
  return evaluateServicePeriodAccess(request, at).allowed;
}
