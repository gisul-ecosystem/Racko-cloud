const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Resolve provisioned IAM IC users from provisionStatus or legacy provisionedResources.
 */
export function getProvisionedUsers(request) {
  const fromSteps = request.provisionStatus?.steps?.create_users?.output?.users;
  if (Array.isArray(fromSteps) && fromSteps.length > 0) {
    return fromSteps.map((user) => ({
      userId: user.userId || user.user_id,
      username: user.username,
      email: user.email || user.username,
      dailyLimitReached: Boolean(user.dailyLimitReached ?? user.daily_limit_reached),
    }));
  }

  const assignments = request.provisionedResources?.assignments || [];
  if (assignments.length > 0) {
    return assignments.map((assignment) => ({
      userId: assignment.userId,
      username: assignment.username,
      email: assignment.username,
      dailyLimitReached: false,
    }));
  }

  const labRoles = request.labRoles || [];
  return labRoles.map((role, index) => ({
    userId: `labuser${index + 1}`,
    username: `labuser${index + 1}`,
    email: null,
    dailyLimitReached: false,
  }));
}

export function getUserDailyLimitState(request, userId) {
  const states = request.usageUserStates || [];
  return states.find((entry) => entry.userId === userId) || null;
}

export function getTodayWindowForRequest(request, nowInTz) {
  const windows = request.usageWindows || [];
  if (!windows.length) {
    return null;
  }

  const dayOfWeek = nowInTz.weekday % 7;
  return windows.find((window) => {
    const windowDay = window.dayOfWeek ?? window.day_of_week;
    return windowDay === dayOfWeek;
  });
}

export function formatWindowSummary(windows) {
  return windows
    .map((window) => {
      const day =
        DAY_LABELS[window.dayOfWeek ?? window.day_of_week] ?? window.day?.slice(0, 3) ?? '?';
      const start = window.windowStartTime ?? window.window_start_time ?? window.startTime;
      const end = window.windowEndTime ?? window.window_end_time ?? window.endTime;
      const limit = window.dailyLimitHours ?? window.daily_limit_hours;
      const limitText = limit ? ` (max ${limit}h)` : '';
      return `${day} ${start}–${end}${limitText}`;
    })
    .join(', ');
}

export function enableIamUser(userId) {
  console.log('[WindowEnforcement] Enabling', userId);
}

export function disableIamUser(userId) {
  console.log('[WindowEnforcement] Disabling', userId);
}
