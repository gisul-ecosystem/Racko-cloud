const BLOCKED_REASON_LABELS = {
  limit_exceeded: 'Daily limit reached',
  outside_window: 'Outside usage window',
  day_disabled: 'Outside scheduled day'
};

function getBlockedReasonLabel(reason) {
  if (!reason) {
    return null;
  }
  return BLOCKED_REASON_LABELS[reason] || reason.replace(/_/g, ' ');
}

/**
 * Pure access-state builder used by evaluateWindowDailyLimitAccess and tests.
 * When limit was already enforced today (DB flag), remainingMinutes stays 0 even if
 * live session sums drop after a stale close.
 */
function computeWindowAccessState({
  config,
  withinWindow,
  consumedMinutes,
  limitMinutes,
  limitReachedInDb
}) {
  const remainingMinutes =
    limitMinutes != null ? Math.max(0, limitMinutes - consumedMinutes) : null;
  const dailyLimitHit =
    limitReachedInDb === true ||
    (limitMinutes != null && consumedMinutes >= limitMinutes);

  if (!config?.todayWindow) {
    return {
      allowed: false,
      reason: 'day_disabled',
      consumedMinutes: 0,
      limitMinutes: null,
      remainingMinutes: 0,
      limitReached: false,
      blockedForToday: true,
      blockedReason: 'day_disabled',
      blockedReasonLabel: getBlockedReasonLabel('day_disabled'),
      withinWindow: false,
      todayWindow: null,
      timezone: config?.timezone || 'Asia/Kolkata',
      message: 'Access is not allowed on this day.'
    };
  }

  if (dailyLimitHit) {
    return {
      allowed: false,
      reason: 'limit_exceeded',
      consumedMinutes,
      limitMinutes,
      remainingMinutes: 0,
      limitReached: true,
      blockedForToday: true,
      blockedReason: 'limit_exceeded',
      blockedReasonLabel: getBlockedReasonLabel('limit_exceeded'),
      withinWindow,
      todayWindow: config.todayWindow,
      timezone: config.timezone,
      message: 'Daily usage limit reached for today.'
    };
  }

  if (!withinWindow) {
    return {
      allowed: false,
      reason: 'outside_window',
      consumedMinutes,
      limitMinutes,
      remainingMinutes,
      limitReached: false,
      blockedForToday: true,
      blockedReason: 'outside_window',
      blockedReasonLabel: getBlockedReasonLabel('outside_window'),
      withinWindow: false,
      todayWindow: config.todayWindow,
      timezone: config.timezone,
      message: 'Access is only allowed during scheduled hours.'
    };
  }

  return {
    allowed: true,
    reason: 'ok',
    consumedMinutes,
    limitMinutes,
    remainingMinutes,
    limitReached: false,
    blockedForToday: false,
    blockedReason: null,
    blockedReasonLabel: null,
    withinWindow: true,
    todayWindow: config.todayWindow,
    timezone: config.timezone,
    message: 'Access allowed.'
  };
}

module.exports = {
  BLOCKED_REASON_LABELS,
  getBlockedReasonLabel,
  computeWindowAccessState
};
