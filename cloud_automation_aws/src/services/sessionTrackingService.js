import SessionLog from '../models/SessionLog.js';
import Request from '../models/Request.js';
import {
  endUsageSessionIfActive,
  resolveUsageUserId,
  startUsageSession,
  userIdFromIndex,
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

export async function getActiveSessionsForRequest(requestId) {
  return SessionLog.find({ requestId, status: 'active' });
}

export function getLiveSessionMins(session) {
  if (!session || session.status !== 'active') return 0;
  return Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 60000);
}
