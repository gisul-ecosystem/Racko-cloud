import { DateTime } from 'luxon';
import Request from '../models/Request.js';
import UserSpend from '../models/UserSpend.js';
import CleanupLog from '../models/CleanupLog.js';
import HistorySnapshot from '../models/HistorySnapshot.js';
import { countCleanupDeleted } from '../utils/cleanupMetrics.js';
import { sumMergedSessionMinutes } from '../utils/sessionIntervalMerge.js';
import { getRequestTimezone } from '../utils/usageWindowAccess.js';
import { resolveUsageUserId } from './usageService.js';
import { syncActiveMagicLinkUsageSessions } from './sessionTrackingService.js';

const round4 = (value) => Number(Number(value || 0).toFixed(4));

function getSessionMergeGapMs() {
  return Number(process.env.SESSION_MERGE_GAP_MINUTES || 2) * 60 * 1000;
}

function getRequestUsers(request) {
  const accessType = request.accessType || 'magic_link';
  const source =
    accessType === 'identity_center' ? request.identityUsers || [] : request.labRoles || [];
  return source.filter((entry) => !entry.deletedAt);
}

function getRequestHourlyRate(request) {
  const services = request.selectedServices || [];
  return services.reduce((sum, service) => {
    const pricePerDay = Number(service.pricePerDay || 0);
    if (!Number.isFinite(pricePerDay) || pricePerDay <= 0) return sum;
    return sum + pricePerDay / 24;
  }, 0);
}

function sessionIntervalsForUser(sessions, userId) {
  return (sessions || [])
    .filter((session) => session.userId === userId)
    .map((session) => ({
      start: new Date(session.loginAt),
      end: session.logoutAt ? new Date(session.logoutAt) : new Date(),
    }));
}

function computeLifetimeMinutes(sessions, userId) {
  return sumMergedSessionMinutes(sessionIntervalsForUser(sessions, userId), getSessionMergeGapMs());
}

function computeTodayMinutes(sessions, userId, timezone) {
  const tz = timezone || 'Asia/Kolkata';
  const todayDate = DateTime.now().setZone(tz).toISODate();
  const intervals = sessionIntervalsForUser(sessions, userId).filter((interval) => {
    const loginDate = DateTime.fromJSDate(interval.start).setZone(tz).toISODate();
    return loginDate === todayDate;
  });
  return sumMergedSessionMinutes(intervals, getSessionMergeGapMs());
}

function usernameForIndex(request, userIndex) {
  const user = getRequestUsers(request).find((entry) => Number(entry.userIndex) === Number(userIndex));
  if (user?.username) return user.username;
  if (user?.roleName) return user.roleName;
  return `labuser${Number(userIndex) + 1}`;
}

function monthStartDateString(timezone) {
  return DateTime.now().setZone(timezone || 'UTC').startOf('month').toISODate();
}

async function getAwsCostMtdByUsername(requestId, usernames, timezone) {
  const fromDate = monthStartDateString(timezone);
  const records = await UserSpend.find({
    requestId,
    username: { $in: usernames },
    date: { $gte: fromDate },
  }).lean();

  const totals = new Map();
  for (const record of records) {
    const key = String(record.username);
    totals.set(key, (totals.get(key) || 0) + Number(record.spendUsd || 0));
  }
  return totals;
}

export async function captureUserLabMetrics(requestId, userIndex) {
  const request = await Request.findById(requestId);
  if (!request) return null;

  const { user } = (() => {
    const field =
      (request.accessType || 'magic_link') === 'identity_center' ? 'identityUsers' : 'labRoles';
    return {
      field,
      user: (request[field] || []).find((entry) => Number(entry.userIndex) === Number(userIndex)),
    };
  })();

  if (!user || user.deletedAt) return null;

  const timezone = getRequestTimezone(request);
  const hourlyRate = getRequestHourlyRate(request);
  const userId = resolveUsageUserId(request, Number(userIndex));
  const username = user.username || user.roleName || `labuser${Number(userIndex) + 1}`;
  const lifetimeMinutes = computeLifetimeMinutes(request.usageSessions, userId);
  const todayMinutes = computeTodayMinutes(request.usageSessions, userId, timezone);
  const spendMap = await getAwsCostMtdByUsername(requestId, [username], timezone);

  return {
    userIndex: Number(userIndex),
    userId,
    username,
    resourceCount: Number(user.lastResourceCount || 0),
    peakResourceCount: Number(user.peakResourceCount || 0),
    totalMinutesLifetime: round4(lifetimeMinutes),
    totalMinutesToday: round4(todayMinutes),
    liveCostUsd: round4((lifetimeMinutes / 60) * hourlyRate),
    awsCostMtdUsd: round4(spendMap.get(username) || Number(user.currentSpend || 0)),
    hourlyRateUsd: hourlyRate,
  };
}

export async function updateUserResourceCounts(requestId, userIndex, resourceCount, { afterCleanup = false } = {}) {
  const request = await Request.findById(requestId);
  if (!request) return null;

  const field =
    (request.accessType || 'magic_link') === 'identity_center' ? 'identityUsers' : 'labRoles';
  const users = request[field] || [];
  const idx = users.findIndex((entry) => Number(entry.userIndex) === Number(userIndex));
  if (idx < 0) return null;

  const found = Math.max(0, Number(resourceCount) || 0);
  const previousPeak = Number(users[idx].peakResourceCount || 0);
  const nextLast = afterCleanup ? 0 : found;
  const nextPeak = Math.max(previousPeak, found);

  await Request.updateOne(
    { _id: requestId, [`${field}.userIndex`]: Number(userIndex) },
    {
      $set: {
        [`${field}.$.lastResourceCount`]: nextLast,
        [`${field}.$.peakResourceCount`]: nextPeak,
        updatedAt: new Date(),
      },
    }
  );

  return { lastResourceCount: nextLast, peakResourceCount: nextPeak };
}

export async function recordCleanupSnapshot({
  requestId,
  userIndex,
  triggeredBy,
  cleanupAction,
  resourcesDeleted,
  metrics: precomputedMetrics,
}) {
  const metrics =
    precomputedMetrics ||
    (userIndex != null ? await captureUserLabMetrics(requestId, userIndex) : null);

  const deletedList = Array.isArray(resourcesDeleted) ? resourcesDeleted : [];
  const deletedCount = deletedList.length || Number(resourcesDeleted) || 0;
  const resourceCount =
    metrics?.resourceCount != null
      ? Math.max(Number(metrics.resourceCount) || 0, deletedCount)
      : deletedCount;

  if (userIndex != null) {
    await updateUserResourceCounts(requestId, userIndex, resourceCount, {
      afterCleanup: cleanupAction !== 'pause',
    });
  }

  return HistorySnapshot.create({
    requestId,
    userIndex: userIndex != null ? Number(userIndex) : null,
    event: 'cleanup_snapshot',
    actor: triggeredBy || 'scheduler',
    summary: `Cleanup snapshot · ${deletedCount} resource(s)`,
    snapshot: {
      eventType: 'cleanup',
      cleanupAction: cleanupAction || 'delete',
      resourceCount,
      peakResourceCount: Math.max(Number(metrics?.peakResourceCount || 0), resourceCount),
      totalMinutesLifetime: metrics?.totalMinutesLifetime ?? null,
      totalMinutesToday: metrics?.totalMinutesToday ?? null,
      liveCostUsd: metrics?.liveCostUsd ?? null,
      awsCostMtdUsd: metrics?.awsCostMtdUsd ?? null,
      resourcesDeleted: deletedList.length ? deletedList : deletedCount,
      resourcesDeletedCount: deletedCount,
      username: metrics?.username || null,
      hourlyRateUsd: metrics?.hourlyRateUsd ?? null,
    },
  });
}

function buildDailyUsageFromSessions(request, users, timezone) {
  const tz = timezone || 'Asia/Kolkata';
  const byKey = new Map();

  for (const session of request.usageSessions || []) {
    const user = users.find((entry) => resolveUsageUserId(request, entry.userIndex) === session.userId);
    if (!user) continue;

    const loginAt = DateTime.fromJSDate(new Date(session.loginAt)).setZone(tz);
    const logoutAt = session.logoutAt
      ? DateTime.fromJSDate(new Date(session.logoutAt)).setZone(tz)
      : DateTime.now().setZone(tz);
    const trackingDate = loginAt.toISODate();
    const minutes = Math.max(0, logoutAt.diff(loginAt, 'minutes').minutes);
    const key = `${session.userId}:${trackingDate}`;
    const existing = byKey.get(key) || {
      userIndex: user.userIndex,
      userId: session.userId,
      username: user.username || user.roleName || session.username || session.userId,
      trackingDate,
      consumedMinutes: 0,
      limitReached: false,
      limitReachedAt: null,
    };
    existing.consumedMinutes += minutes;
    byKey.set(key, existing);
  }

  for (const state of request.usageUserStates || []) {
    if (!state.dailyLimitReached) continue;
    const today = DateTime.now().setZone(tz).toISODate();
    const key = `${state.userId}:${today}`;
    const existing = byKey.get(key) || {
      userIndex: userIndexFromUserIdSafe(state.userId),
      userId: state.userId,
      username: state.username || state.userId,
      trackingDate: today,
      consumedMinutes: 0,
      limitReached: true,
      limitReachedAt: new Date().toISOString(),
    };
    existing.limitReached = true;
    existing.limitReachedAt = existing.limitReachedAt || new Date().toISOString();
    byKey.set(key, existing);
  }

  return [...byKey.values()]
    .map((row) => ({
      ...row,
      consumedMinutes: round4(row.consumedMinutes),
    }))
    .sort((a, b) => String(b.trackingDate).localeCompare(String(a.trackingDate)));
}

function userIndexFromUserIdSafe(userId) {
  const match = String(userId || '').match(/(\d+)$/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? Math.max(0, value - 1) : null;
}

export async function getLabHistoryForRequest(requestId, { userIndex = null, limit = 200 } = {}) {
  const resolvedLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
  const resolvedUserIndex =
    userIndex !== null && userIndex !== undefined && userIndex !== ''
      ? Number(userIndex)
      : null;

  await syncActiveMagicLinkUsageSessions(requestId).catch(() => null);

  const request = await Request.findById(requestId);
  if (!request) return null;

  const timezone = getRequestTimezone(request);
  const hourlyRate = getRequestHourlyRate(request);
  let users = getRequestUsers(request);
  if (resolvedUserIndex != null) {
    users = users.filter((entry) => Number(entry.userIndex) === resolvedUserIndex);
  }

  const usernames = users.map(
    (user) => user.username || user.roleName || `labuser${Number(user.userIndex) + 1}`
  );
  const spendMap = await getAwsCostMtdByUsername(requestId, usernames, timezone);

  const cleanupQuery = { requestId, status: 'success' };
  if (resolvedUserIndex != null) cleanupQuery.userIndex = resolvedUserIndex;

  const snapshotQuery = { requestId };
  if (resolvedUserIndex != null) snapshotQuery.userIndex = resolvedUserIndex;

  const [cleanupLogs, snapshots] = await Promise.all([
    CleanupLog.find(cleanupQuery).sort({ completedAt: -1, ranAt: -1 }).limit(resolvedLimit).lean(),
    HistorySnapshot.find(snapshotQuery).sort({ createdAt: -1 }).limit(resolvedLimit).lean(),
  ]);

  const cleanupCountByUser = new Map();
  for (const log of cleanupLogs) {
    if (log.userIndex == null) continue;
    const key = Number(log.userIndex);
    cleanupCountByUser.set(key, (cleanupCountByUser.get(key) || 0) + 1);
  }
  // Request-level cleanups count once for each user that was present when history is viewed
  const requestLevelCleanups = cleanupLogs.filter((log) => log.userIndex == null).length;
  for (const user of users) {
    const key = Number(user.userIndex);
    cleanupCountByUser.set(
      key,
      (cleanupCountByUser.get(key) || 0) + requestLevelCleanups
    );
  }

  const userSummaries = users.map((user) => {
    const userId = resolveUsageUserId(request, user.userIndex);
    const username = user.username || user.roleName || `labuser${Number(user.userIndex) + 1}`;
    const userSessions = (request.usageSessions || []).filter((session) => session.userId === userId);
    const lifetimeMinutes = computeLifetimeMinutes(request.usageSessions, userId);
    const todayMinutes = computeTodayMinutes(request.usageSessions, userId, timezone);
    const openSessions = userSessions.filter((session) => !session.logoutAt).length;

    return {
      userIndex: Number(user.userIndex),
      userId,
      username,
      totalMinutesLifetime: round4(lifetimeMinutes),
      totalMinutesToday: round4(todayMinutes),
      liveCostUsd: round4((lifetimeMinutes / 60) * hourlyRate),
      awsCostMtdUsd: round4(spendMap.get(username) || Number(user.currentSpend || 0)),
      budgetAmountUsd:
        request.perUserBudgetUsd != null
          ? Number(request.perUserBudgetUsd) + Number(user.budgetTopUpUsd || 0)
          : null,
      costCurrency: 'USD',
      currentResourceCount: Number(user.lastResourceCount || 0),
      peakResourceCount: Number(user.peakResourceCount || 0),
      sessionCount: userSessions.length,
      openSessions,
      cleanupRunCount: cleanupCountByUser.get(Number(user.userIndex)) || 0,
    };
  });

  const timeline = [];

  const sessions = (request.usageSessions || [])
    .filter((session) => {
      if (resolvedUserIndex == null) return true;
      return resolveUsageUserId(request, resolvedUserIndex) === session.userId;
    })
    .slice()
    .sort((a, b) => new Date(b.loginAt).getTime() - new Date(a.loginAt).getTime())
    .slice(0, resolvedLimit);

  for (const session of sessions) {
    const loginAt = new Date(session.loginAt);
    const endAt = session.logoutAt ? new Date(session.logoutAt) : new Date();
    const duration = Math.max(0, (endAt.getTime() - loginAt.getTime()) / 60000);
    const matchedUser = users.find(
      (entry) => resolveUsageUserId(request, entry.userIndex) === session.userId
    );

    timeline.push({
      id: `session-${session._id}`,
      type: 'session',
      at: session.loginAt,
      userIndex: matchedUser?.userIndex ?? userIndexFromUserIdSafe(session.userId),
      username: matchedUser?.username || matchedUser?.roleName || session.username || session.userId,
      title: session.logoutAt ? 'Session ended' : 'Session active',
      subtitle: session.logoutAt ? 'closed' : 'online',
      minutes: round4(duration),
      liveCostUsd: round4((duration / 60) * hourlyRate),
      logoutAt: session.logoutAt || null,
      isActive: !session.logoutAt,
    });
  }

  for (const snap of snapshots) {
    if (snap.event === 'cleanup_snapshot') {
      const deletedCount =
        Number(snap.snapshot?.resourcesDeletedCount) ||
        (Array.isArray(snap.snapshot?.resourcesDeleted)
          ? snap.snapshot.resourcesDeleted.length
          : Number(snap.snapshot?.resourcesDeleted) || 0);

      timeline.push({
        id: `cleanup-snap-${snap._id}`,
        type: 'cleanup_snapshot',
        at: snap.createdAt,
        userIndex: snap.userIndex,
        username:
          snap.snapshot?.username ||
          (snap.userIndex != null ? usernameForIndex(request, snap.userIndex) : null),
        title: 'Cleanup snapshot',
        subtitle: `${snap.snapshot?.cleanupAction || 'delete'} · ${deletedCount} resource(s) removed`,
        resourceCount: snap.snapshot?.resourceCount ?? null,
        peakResourceCount: snap.snapshot?.peakResourceCount ?? null,
        minutesLifetime: snap.snapshot?.totalMinutesLifetime ?? null,
        minutesToday: snap.snapshot?.totalMinutesToday ?? null,
        liveCostUsd: snap.snapshot?.liveCostUsd ?? null,
        awsCostMtdUsd: snap.snapshot?.awsCostMtdUsd ?? null,
        resourcesDeleted: deletedCount,
        triggeredBy: snap.actor,
      });
      continue;
    }

    if (snap.event === 'user_cleanup' || snap.event === 'request_cleanup' || snap.event === 'scheduled_cleanup') {
      // Prefer dedicated cleanup_snapshot / CleanupLog rows; still keep rich admin cleanup if snapshot has metrics.
      if (snap.snapshot?.liveCostUsd != null || snap.snapshot?.resourceCount != null) {
        timeline.push({
          id: `cleanup-snap-${snap._id}`,
          type: 'cleanup_snapshot',
          at: snap.createdAt,
          userIndex: snap.userIndex,
          username:
            snap.snapshot?.username ||
            (snap.userIndex != null ? usernameForIndex(request, snap.userIndex) : 'All users'),
          title: 'Cleanup snapshot',
          subtitle: snap.summary || snap.event.replace(/_/g, ' '),
          resourceCount: snap.snapshot?.resourceCount ?? null,
          peakResourceCount: snap.snapshot?.peakResourceCount ?? null,
          liveCostUsd: snap.snapshot?.liveCostUsd ?? null,
          awsCostMtdUsd: snap.snapshot?.awsCostMtdUsd ?? null,
          resourcesDeleted: Number(snap.snapshot?.deletedCount || 0),
          triggeredBy: snap.actor,
        });
      }
      continue;
    }

    timeline.push({
      id: `admin-${snap._id}`,
      type: 'admin_event',
      at: snap.createdAt,
      userIndex: snap.userIndex,
      username:
        snap.userIndex != null ? usernameForIndex(request, snap.userIndex) : null,
      title: snap.summary || String(snap.event || '').replace(/_/g, ' '),
      subtitle: snap.actor,
      status: snap.snapshot?.status,
      costUsd: snap.snapshot?.costUsd,
      resourcesDeleted: snap.snapshot?.deletedCount,
      triggeredBy: snap.actor,
    });
  }

  for (const log of cleanupLogs) {
    const deletedCount = Math.max(
      Number(log.totalDeleted) || 0,
      countCleanupDeleted(log.results)
    );
    timeline.push({
      id: `cleanup-log-${log._id}`,
      type: 'cleanup_log',
      at: log.completedAt || log.ranAt || log.createdAt,
      userIndex: log.userIndex ?? null,
      username:
        log.userIndex != null ? usernameForIndex(request, log.userIndex) : 'All users',
      title: 'Cleanup run',
      subtitle: log.triggeredBy || 'scheduler',
      resourcesDeleted: deletedCount,
      status: log.status,
      error: log.error || null,
      triggeredBy: log.triggeredBy,
    });
  }

  const dailyUsage = buildDailyUsageFromSessions(request, getRequestUsers(request), timezone).filter(
    (row) => resolvedUserIndex == null || Number(row.userIndex) === resolvedUserIndex
  );

  for (const row of dailyUsage) {
    timeline.push({
      id: `daily-${row.userId}-${row.trackingDate}`,
      type: 'daily_usage',
      at: row.limitReachedAt || `${row.trackingDate}T12:00:00.000Z`,
      userIndex: row.userIndex,
      username: row.username,
      title: row.limitReached ? 'Daily limit reached' : 'Daily usage recorded',
      subtitle: `${Math.round(row.consumedMinutes || 0)} min used`,
      minutes: row.consumedMinutes,
      limitReached: row.limitReached === true,
    });
  }

  timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const trimmedTimeline = timeline.slice(0, resolvedLimit);

  return {
    requestId: String(requestId),
    expiryDate: request.endDate || null,
    labCreatedAt: request.createdAt || null,
    hourlyRateUsd: round4(hourlyRate),
    defaultCostCurrency: 'USD',
    userSummaries,
    timeline: trimmedTimeline,
    sessions: sessions.map((session) => {
      const loginAt = new Date(session.loginAt);
      const endAt = session.logoutAt ? new Date(session.logoutAt) : new Date();
      const duration = Math.max(0, (endAt.getTime() - loginAt.getTime()) / 60000);
      const matchedUser = users.find(
        (entry) => resolveUsageUserId(request, entry.userIndex) === session.userId
      );
      return {
        id: String(session._id),
        userIndex: matchedUser?.userIndex ?? userIndexFromUserIdSafe(session.userId),
        username: matchedUser?.username || matchedUser?.roleName || session.username || session.userId,
        loginAt: session.loginAt,
        logoutAt: session.logoutAt || null,
        minutesUsed: round4(duration),
        endedReason: session.logoutAt ? 'ended' : null,
        liveCostUsd: round4((duration / 60) * hourlyRate),
        isActive: !session.logoutAt,
      };
    }),
    cleanupSnapshots: snapshots
      .filter((snap) => snap.event === 'cleanup_snapshot')
      .map((snap) => ({
        id: String(snap._id),
        userIndex: snap.userIndex,
        username: snap.snapshot?.username || null,
        eventAt: snap.createdAt,
        ...snap.snapshot,
      })),
    dailyUsage,
    // Backward-compatible flat entries for older clients
    entries: trimmedTimeline.map((entry) => ({
      id: entry.id,
      type: entry.type,
      at: entry.at,
      userIndex: entry.userIndex ?? null,
      username: entry.username ?? null,
      title: entry.title,
      subtitle: entry.subtitle ?? null,
      costUsd: entry.liveCostUsd ?? entry.awsCostMtdUsd ?? entry.costUsd ?? null,
      resourcesDeleted: entry.resourcesDeleted ?? null,
      status: entry.status ?? null,
    })),
  };
}
