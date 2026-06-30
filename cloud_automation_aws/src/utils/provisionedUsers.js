import Request from '../models/Request.js';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseUserIndexFromUserId(userId) {
  const match = String(userId || '').match(/^labuser(\d+)$/i);
  if (!match) return null;
  return Number(match[1]) - 1;
}

/**
 * Resolve provisioned IAM IC users from provisionStatus or legacy provisionedResources.
 */
export function getProvisionedUsers(request) {
  const fromSteps = request.provisionStatus?.steps?.create_users?.output?.users;
  if (Array.isArray(fromSteps) && fromSteps.length > 0) {
    return fromSteps.map((user, index) => ({
      userId: user.userId || user.user_id || `labuser${index + 1}`,
      userIndex: user.userIndex ?? index,
      username: user.username || `labuser${index + 1}`,
      email: user.email || user.username,
      dailyLimitReached: Boolean(user.dailyLimitReached ?? user.daily_limit_reached),
    }));
  }

  const assignments = request.provisionedResources?.assignments || [];
  if (assignments.length > 0) {
    return assignments.map((assignment, index) => ({
      userId: assignment.userId || `labuser${index + 1}`,
      userIndex: assignment.userIndex ?? index,
      username: assignment.username || `labuser${index + 1}`,
      email: assignment.username,
      dailyLimitReached: false,
    }));
  }

  const labRoles = request.labRoles || [];
  return labRoles.map((role) => ({
    userId: `labuser${role.userIndex + 1}`,
    userIndex: role.userIndex,
    username: `labuser${role.userIndex + 1}`,
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

export async function enableIamUser(requestId, userId) {
  const userIndex = parseUserIndexFromUserId(userId);
  if (userIndex == null || !requestId) {
    console.log('[WindowEnforcement] Enabling', userId);
    return;
  }

  await Request.findOneAndUpdate(
    { _id: requestId, 'labRoles.userIndex': userIndex },
    {
      $set: {
        'labRoles.$.suspended': false,
        updatedAt: new Date(),
      },
    }
  );
}

export async function disableIamUser(requestId, userId) {
  const userIndex = parseUserIndexFromUserId(userId);
  if (userIndex == null || !requestId) {
    console.log('[WindowEnforcement] Disabling', userId);
    return;
  }

  await Request.findOneAndUpdate(
    { _id: requestId, 'labRoles.userIndex': userIndex },
    {
      $set: {
        'labRoles.$.suspended': true,
        updatedAt: new Date(),
      },
    }
  );
}
