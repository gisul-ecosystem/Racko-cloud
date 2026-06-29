import { DateTime } from 'luxon';
import Request from '../models/Request.js';
import {
  disableIamUser,
  getUserDailyLimitState,
} from '../utils/provisionedUsers.js';
import {
  evaluateDailyUsageAccess,
  getDailyLimitHours,
  getRequestTimezone,
  sumConsumedMinutesToday,
} from '../utils/usageWindowAccess.js';

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function formatMinutes(value) {
  if (value == null || Number.isNaN(value)) return '—';
  const minutes = Math.max(0, Math.round(value));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function userIdFromIndex(userIndex) {
  return `labuser${userIndex + 1}`;
}

export function resolveUsageUserId(request, userIndex) {
  const accessType = request?.accessType || 'magic_link';
  if (accessType === 'identity_center') {
    const user = request.identityUsers?.find((entry) => entry.userIndex === userIndex);
    return user?.userId || user?.username || userIdFromIndex(userIndex);
  }
  return userIdFromIndex(userIndex);
}

export function userIndexFromUserId(userId, request = null) {
  const match = String(userId || '').match(/^labuser(\d+)$/i);
  if (match) {
    return Number(match[1]) - 1;
  }

  if (request?.identityUsers?.length) {
    const user = request.identityUsers.find(
      (entry) => entry.userId === userId || entry.username === userId
    );
    if (user) {
      return user.userIndex;
    }
  }

  const rackoMatch = String(userId || '').match(/^rackolab(\d+)-/i);
  if (rackoMatch) {
    return Number(rackoMatch[1]) - 1;
  }

  return null;
}

export function getSessionStatsForUser(sessions, userId, timezone) {
  const userSessions = sessions.filter((session) => session.userId === userId);
  const nowInTz = DateTime.now().setZone(timezone);
  const todayDate = nowInTz.toISODate();
  const dayStart = nowInTz.startOf('day');

  let lifetimeMinutes = 0;
  let todayMinutes = 0;
  let activeSessionMinutes = 0;
  let hasActiveSession = false;
  let sessionStartedAt = null;

  for (const session of userSessions) {
    const loginAt = DateTime.fromJSDate(new Date(session.loginAt)).setZone(timezone);
    const logoutAt = session.logoutAt
      ? DateTime.fromJSDate(new Date(session.logoutAt)).setZone(timezone)
      : DateTime.now().setZone(timezone);
    const minutes = logoutAt.diff(loginAt, 'minutes').minutes;

    lifetimeMinutes += minutes;

    if (loginAt >= dayStart) {
      todayMinutes += minutes;
    }

    if (!session.logoutAt) {
      hasActiveSession = true;
      activeSessionMinutes += minutes;
      sessionStartedAt = session.loginAt;
    }
  }

  return {
    totalMinutesSpent: Math.round(lifetimeMinutes),
    todayMinutes: Math.round(todayMinutes),
    activeSessionMinutes: Math.round(activeSessionMinutes),
    hasActiveSession,
    sessionStartedAt,
    lastLoginAt: userSessions.length
      ? userSessions.reduce((latest, session) =>
          !latest || new Date(session.loginAt) > new Date(latest) ? session.loginAt : latest
        , null)
      : null,
  };
}

export async function startUsageSession({ requestId, userId, username, loginAt = new Date() }) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);

  const access = evaluateDailyUsageAccess(request, userId, loginAt);
  if (!access.allowed) {
    throw createError(access.message, 403);
  }

  const openSession = (request.usageSessions || []).find(
    (session) => session.userId === userId && !session.logoutAt
  );

  if (openSession) {
    return {
      sessionId: openSession._id,
      loginAt: openSession.loginAt,
      alreadyActive: true,
    };
  }

  const updated = await Request.findByIdAndUpdate(
    requestId,
    {
      $push: {
        usageSessions: {
          userId,
          username: username || userId,
          loginAt,
          logoutAt: null,
        },
      },
      updatedAt: new Date(),
    },
    { new: true }
  );

  const session = updated.usageSessions[updated.usageSessions.length - 1];
  return {
    sessionId: session._id,
    loginAt: session.loginAt,
    alreadyActive: false,
  };
}

export async function endUsageSessionIfActive({ requestId, userId }) {
  const request = await Request.findById(requestId);
  if (!request) return null;

  const openSession = (request.usageSessions || []).find(
    (session) => session.userId === userId && !session.logoutAt
  );
  if (!openSession) return null;

  return endUsageSession({ requestId, userId });
}

export async function endUsageSession({ requestId, userId }) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);

  const sessionIndex = (request.usageSessions || []).findIndex(
    (session) => session.userId === userId && !session.logoutAt
  );

  if (sessionIndex < 0) {
    throw createError('No active session found', 404);
  }

  const session = request.usageSessions[sessionIndex];
  const loginAt = new Date(session.loginAt);
  const logoutAt = new Date();
  const minutesUsed = Math.ceil((logoutAt - loginAt) / 60000);

  await Request.updateOne(
    { _id: requestId },
    {
      $set: {
        [`usageSessions.${sessionIndex}.logoutAt`]: logoutAt,
        [`usageSessions.${sessionIndex}.minutesUsed`]: minutesUsed,
        updatedAt: new Date(),
      },
    }
  );

  return { minutesUsed, logoutAt };
}

export async function handleDailyLimitReached(request, user, consumedMinutes, dailyLimitHours) {
  const userIndex = userIndexFromUserId(user.userId, request);
  if (userIndex != null) {
    const { expireMagicLinkSessionsForUser } = await import('./sessionTrackingService.js');
    await expireMagicLinkSessionsForUser(String(request._id), userIndex);
  }

  const accessType = request.accessType || 'magic_link';
  if (accessType === 'identity_center' && userIndex != null) {
    const { suspendIdentityUser } = await import('../provisioners/aws/identityProvisioner.js');
    await suspendIdentityUser(request, userIndex);
  } else {
    await disableIamUser(String(request._id), user.userId);
  }

  const existingState = (request.usageUserStates || []).some(
    (entry) => entry.userId === user.userId
  );

  if (existingState) {
    await Request.findOneAndUpdate(
      { _id: request._id },
      {
        $set: {
          'usageUserStates.$[existing].dailyLimitReached': true,
          updatedAt: new Date(),
        },
      },
      { arrayFilters: [{ 'existing.userId': user.userId }] }
    );
  } else {
    await Request.findByIdAndUpdate(request._id, {
      $push: {
        usageUserStates: {
          userId: user.userId,
          username: user.username,
          email: user.email,
          dailyLimitReached: true,
        },
      },
      updatedAt: new Date(),
    });
  }

  await Request.updateOne(
    { _id: request._id },
    {
      $set: {
        'usageSessions.$[session].logoutAt': new Date(),
        updatedAt: new Date(),
      },
    },
    { arrayFilters: [{ 'session.userId': user.userId, 'session.logoutAt': null }] }
  );

  console.log(
    `[UsageService] Daily limit reached for ${user.username} — access disabled (${consumedMinutes.toFixed(1)}/${dailyLimitHours * 60} min)`
  );
}

export async function monitorActiveSessions() {
  const requests = await Request.find({
    status: 'Completed',
    enableDailyUsage: true,
    startDate: { $lte: new Date() },
    endDate: { $gte: new Date() },
  });

  for (const request of requests) {
    const timezone = getRequestTimezone(request);
    const nowInTz = DateTime.now().setZone(timezone);
    const todayDate = nowInTz.toISODate();
    const dailyLimitHours = getDailyLimitHours(request, nowInTz);
    if (dailyLimitHours == null) continue;

    const users = [...new Set((request.usageSessions || []).map((session) => session.userId))];

    for (const userId of users) {
      const state = getUserDailyLimitState(request, userId);
      if (state?.dailyLimitReached) continue;

      const userSessions = (request.usageSessions || []).filter(
        (session) => session.userId === userId
      );
      const consumedMinutes = sumConsumedMinutesToday(userSessions, todayDate, timezone);

      if (consumedMinutes >= dailyLimitHours * 60) {
        const user = {
          userId,
          username: userId,
          email: userId,
        };
        await handleDailyLimitReached(request, user, consumedMinutes, dailyLimitHours);
      }
    }
  }
}

export async function forceLogoutUser({ requestId, userIndex }) {
  const request = await Request.findById(requestId);
  if (!request) throw createError('Request not found', 404);

  const userId = resolveUsageUserId(request, userIndex);

  const { expireMagicLinkSessionsForUser } = await import('./sessionTrackingService.js');
  await expireMagicLinkSessionsForUser(requestId, userIndex);

  const endedUsage = await endUsageSessionIfActive({ requestId, userId }).catch(() => null);
  if (endedUsage) {
    return {
      success: true,
      sessionsClosedCount: 1,
      message: 'User session ended.',
    };
  }

  const refreshed = await Request.findById(requestId);
  const openSessions = (refreshed?.usageSessions || []).filter(
    (session) => session.userId === userId && !session.logoutAt
  );

  if (!openSessions.length) {
    return { success: true, sessionsClosedCount: 0, message: 'No active sessions to logout.' };
  }

  const now = new Date();
  const updates = {};
  for (const session of openSessions) {
    const sessionIndex = refreshed.usageSessions.findIndex(
      (entry) => String(entry._id) === String(session._id)
    );
    if (sessionIndex < 0) continue;

    const minutesUsed = Math.ceil((now - new Date(session.loginAt)) / 60000);
    updates[`usageSessions.${sessionIndex}.logoutAt`] = now;
    updates[`usageSessions.${sessionIndex}.minutesUsed`] = minutesUsed;
  }

  updates.updatedAt = now;
  await Request.updateOne({ _id: requestId }, { $set: updates });

  return {
    success: true,
    sessionsClosedCount: openSessions.length,
    message: 'User session ended.',
  };
}

export function assertUsageAccessAllowed(request, userIndex, at = new Date()) {
  const userId = resolveUsageUserId(request, userIndex);
  const access = evaluateDailyUsageAccess(request, userId, at);
  if (!access.allowed) {
    throw createError(access.message, 403);
  }
  return access;
}
