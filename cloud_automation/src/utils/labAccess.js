const { evaluateServicePeriodAccess } = require('./servicePeriodAccess');
const { isWithinUsageWindowTime } = require('./usageWindowTime');

const BLOCKED_REASON_LABELS = {
  before_start: 'Lab has not started yet',
  after_end: 'Lab access has expired',
  outside_window: 'Outside usage window',
  day_disabled: 'Outside scheduled day',
  limit_exceeded: 'Daily limit reached'
};

function getLabBlockedReasonLabel(reason) {
  if (!reason) {
    return null;
  }
  return BLOCKED_REASON_LABELS[reason] || reason.replace(/_/g, ' ');
}

/**
 * Whether lab users should be unblocked in Azure right now.
 * Requires BOTH service period (starts_at / expires_at) AND daily usage window.
 */
function evaluateCombinedLabAccess(request, windows = [], at = new Date()) {
  const serviceAccess = evaluateServicePeriodAccess(request, at);
  if (!serviceAccess.allowed) {
    return {
      allowed: false,
      reason: serviceAccess.reason,
      message: serviceAccess.message,
      blockedReason: serviceAccess.reason,
      blockedReasonLabel: getLabBlockedReasonLabel(serviceAccess.reason),
      withinServicePeriod: false,
      withinUsageWindow: false,
      startsAt: serviceAccess.startsAt,
      endsAt: serviceAccess.endsAt
    };
  }

  const hasWindows = Array.isArray(windows) && windows.length > 0;
  if (!hasWindows) {
    return {
      allowed: true,
      reason: 'ok',
      message: null,
      blockedReason: null,
      blockedReasonLabel: null,
      withinServicePeriod: true,
      withinUsageWindow: true,
      startsAt: serviceAccess.startsAt,
      endsAt: serviceAccess.endsAt
    };
  }

  const withinUsageWindow = isWithinUsageWindowTime(windows, at);
  if (!withinUsageWindow) {
    return {
      allowed: false,
      reason: 'outside_window',
      message: 'Access is only allowed during scheduled hours.',
      blockedReason: 'outside_window',
      blockedReasonLabel: getLabBlockedReasonLabel('outside_window'),
      withinServicePeriod: true,
      withinUsageWindow: false,
      startsAt: serviceAccess.startsAt,
      endsAt: serviceAccess.endsAt
    };
  }

  return {
    allowed: true,
    reason: 'ok',
    message: null,
    blockedReason: null,
    blockedReasonLabel: null,
    withinServicePeriod: true,
    withinUsageWindow: true,
    startsAt: serviceAccess.startsAt,
    endsAt: serviceAccess.endsAt
  };
}

function shouldLabUsersBeUnblocked(request, windows = [], at = new Date()) {
  return evaluateCombinedLabAccess(request, windows, at).allowed;
}

module.exports = {
  BLOCKED_REASON_LABELS,
  getLabBlockedReasonLabel,
  evaluateCombinedLabAccess,
  shouldLabUsersBeUnblocked
};
