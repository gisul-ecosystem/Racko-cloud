import SessionLog from '../models/SessionLog.js';
import Request from '../models/Request.js';
import {
  endUsageSession,
  endUsageSessionIfActive,
  resolveUsageUserId,
  startUsageSession,
  userIdFromIndex,
  userIndexFromUserId,
} from './usageService.js';

async function usageUserIdForRequest(requestId, userIndex) {
  const request = await Request.findById(requestId).select('accessType identityUsers').lean();
  return resolveUsageUserId(request, userIndex);
}

export async function startMagicLinkSession(requestId, userIndex, roleArn, sessionName, expiresAt) {
  const username = `labuser${userIndex + 1}`;
  const startedAt = new Date();

  await expireMagicLinkSessionsForUser(requestId, userIndex, startedAt);

  const session = await SessionLog.create({
    requestId,
    userIndex,
    username,
    accessType: 'magic_link',
    roleArn,
    sessionName,
    startedAt,
    expiresAt,
    status: 'active',
  });

  await startUsageSession({
    requestId,
    userId: userIdFromIndex(userIndex),
    username,
    loginAt: startedAt,
  }).catch(() => null);

  await Request.findOneAndUpdate(
    { _id: requestId, 'labRoles.userIndex': userIndex },
    { $set: { 'labRoles.$.lastSessionAt': startedAt } }
  );

  return session;
}

export async function startDirectIamSession(requestId, userIndex, loginAt = new Date(), expiresAt = null) {
  const request = await Request.findById(requestId);
  if (!request) return null;

  const user = request.identityUsers?.find((entry) => entry.userIndex === userIndex);
  if (!user) return null;

  const username = user.username;
  const userId = user.userId || user.username;

  await expireMagicLinkSessionsForUser(requestId, userIndex, loginAt);

  const session = await SessionLog.create({
    requestId,
    userIndex,
    username,
    userId,
    accessType: 'identity_center',
    startedAt: loginAt,
    expiresAt,
    status: 'active',
  });

  await startUsageSession({
    requestId,
    userId,
    username,
    loginAt,
  }).catch(() => null);

  await Request.findOneAndUpdate(
    { _id: requestId, 'identityUsers.userIndex': userIndex },
    { $set: { 'identityUsers.$.lastSessionAt': loginAt } }
  );

  return session;
}

export async function syncActiveMagicLinkUsageSessions(requestId) {
  const activeSessions = await SessionLog.find({ requestId, status: 'active' });
  if (!activeSessions.length) return;

  const request = await Request.findById(requestId);
  if (!request) return;

  for (const sessionLog of activeSessions) {
    const userId = resolveUsageUserId(request, sessionLog.userIndex);
    const openUsage = (request.usageSessions || []).find(
      (session) => session.userId === userId && !session.logoutAt
    );
    if (openUsage) continue;

    await startUsageSession({
      requestId,
      userId,
      username: sessionLog.username,
      loginAt: sessionLog.startedAt,
    }).catch(() => null);
  }
}

export async function expireMagicLinkSessionsForUser(requestId, userIndex, endedAt = new Date()) {
  const activeSessions = await SessionLog.find({ requestId, userIndex, status: 'active' });
  const userId = await usageUserIdForRequest(requestId, userIndex);

  for (const session of activeSessions) {
    const durationMins = Math.max(
      0,
      Math.floor((endedAt.getTime() - new Date(session.startedAt).getTime()) / 60000)
    );
    await SessionLog.updateOne(
      { _id: session._id },
      { $set: { status: 'expired', endedAt, durationMins } }
    );
  }

  await endUsageSessionIfActive({
    requestId,
    userId,
  }).catch(() => null);
}

export async function expireOldSessions() {
  const now = new Date();
  const expiringSessions = await SessionLog.find({
    status: 'active',
    expiresAt: { $lt: now },
  });

  for (const session of expiringSessions) {
    const durationMins = getLiveSessionMins(session);
    await SessionLog.updateOne(
      { _id: session._id },
      { $set: { status: 'expired', endedAt: now, durationMins } }
    );

    const userId = await usageUserIdForRequest(session.requestId, session.userIndex);
    await endUsageSessionIfActive({
      requestId: session.requestId,
      userId,
    }).catch(() => null);
  }

  if (expiringSessions.length > 0) {
    console.log(`[sessionTracking] Expired ${expiringSessions.length} sessions`);
  }
}

export async function getUserSessionStats(requestId, userIndex) {
  const sessions = await SessionLog.find({ requestId, userIndex }).sort({ startedAt: -1 });

  const totalMins = sessions.reduce((sum, session) => {
    if (session.status === 'active') {
      return sum + getLiveSessionMins(session);
    }
    return sum + (session.durationMins || 0);
  }, 0);
  const activeSession = sessions.find((s) => s.status === 'active');
  const lastSession = sessions[0];

  return {
    totalSessions: sessions.length,
    totalMins,
    activeSession: activeSession || null,
    lastSessionAt: lastSession?.startedAt || null,
    sessionHistory: sessions.slice(0, 10),
  };
}

/** One query for all users on a request — avoids N SessionLog round-trips in org-admin detail. */
export async function getRequestSessionStatsByUser(requestId) {
  const sessions = await SessionLog.find({ requestId }).sort({ startedAt: -1 }).lean();
  const byUser = new Map();

  for (const session of sessions) {
    const key = Number(session.userIndex);
    if (!byUser.has(key)) byUser.set(key, []);
    byUser.get(key).push(session);
  }

  const statsByUser = new Map();
  for (const [userIndex, userSessions] of byUser.entries()) {
    const totalMins = userSessions.reduce((sum, session) => {
      if (session.status === 'active') {
        return sum + getLiveSessionMins(session);
      }
      return sum + (session.durationMins || 0);
    }, 0);
    const activeSession = userSessions.find((entry) => entry.status === 'active') || null;
    statsByUser.set(userIndex, {
      totalSessions: userSessions.length,
      totalMins,
      activeSession,
      lastSessionAt: userSessions[0]?.startedAt || null,
      sessionHistory: userSessions.slice(0, 10),
    });
  }

  return statsByUser;
}

export async function getActiveSessionsForRequest(requestId) {
  return SessionLog.find({ requestId, status: 'active' });
}

export function getLiveSessionMins(session) {
  if (!session || session.status !== 'active') return 0;
  return Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 60000);
}

export async function expireTimedOutSessionLogsForRequest(requestId, now = new Date()) {
  const expiringSessions = await SessionLog.find({
    requestId,
    status: 'active',
    expiresAt: { $lt: now },
  });

  for (const session of expiringSessions) {
    const durationMins = getLiveSessionMins(session);
    await SessionLog.updateOne(
      { _id: session._id },
      { $set: { status: 'expired', endedAt: now, durationMins } }
    );

    const userId = await usageUserIdForRequest(requestId, session.userIndex);
    await endUsageSessionIfActive({ requestId, userId }).catch(() => null);
  }

  return expiringSessions.length;
}

export async function closeOrphanOpenUsageSessions(
  requestId,
  { activeUserKeys = new Set(), idleMinutes = 5, now = new Date() } = {}
) {
  if (idleMinutes <= 0) {
    return 0;
  }

  const request = await Request.findById(requestId);
  if (!request) {
    return 0;
  }

  const activeSessionLogs = await SessionLog.find({ requestId, status: 'active' });
  const activeLogIndexes = new Set(activeSessionLogs.map((session) => session.userIndex));
  let closed = 0;

  for (const usageSession of request.usageSessions || []) {
    if (usageSession.logoutAt) {
      continue;
    }

    const userIndex = userIndexFromUserId(usageSession.userId, request);
    if (userIndex == null) {
      continue;
    }

    if (activeLogIndexes.has(userIndex)) {
      continue;
    }

    const sessionAgeMinutes =
      (now.getTime() - new Date(usageSession.loginAt).getTime()) / 60000;
    if (sessionAgeMinutes < idleMinutes) {
      continue;
    }

    const activityKey = `${String(requestId)}:${userIndex}`;
    if (activeUserKeys.has(activityKey)) {
      continue;
    }

    await endUsageSession({ requestId, userId: usageSession.userId }).catch(() => null);
    closed += 1;
    console.log(
      `[sessionTracking] Closed orphan usage session for ${usageSession.userId} after ${Math.round(sessionAgeMinutes)} min idle`
    );
  }

  return closed;
}

export async function endIdleSessionLogsForRequest(
  requestId,
  { activeUserKeys = new Set(), idleMinutes = 5, now = new Date() } = {}
) {
  if (idleMinutes <= 0) {
    return 0;
  }

  const request = await Request.findById(requestId).lean();
  if (!request) {
    return 0;
  }

  const activeSessionLogs = await SessionLog.find({ requestId, status: 'active' });
  let ended = 0;

  for (const sessionLog of activeSessionLogs) {
    const sessionAgeMinutes =
      (now.getTime() - new Date(sessionLog.startedAt).getTime()) / 60000;
    if (sessionAgeMinutes < idleMinutes) {
      continue;
    }

    const activityKey = `${String(requestId)}:${sessionLog.userIndex}`;
    if (activeUserKeys.has(activityKey)) {
      continue;
    }

    await expireMagicLinkSessionsForUser(sessionLog.requestId, sessionLog.userIndex, now);

    const { revokeLabUserConsoleSessionsSafe } = await import('./awsSessionRevocationService.js');
    await revokeLabUserConsoleSessionsSafe(sessionLog.requestId, sessionLog.userIndex);

    ended += 1;
    console.log(
      `[sessionTracking] Ended idle session for ${sessionLog.username} after ${Math.round(sessionAgeMinutes)} min`
    );
  }

  return ended;
}
