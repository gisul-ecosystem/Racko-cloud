import { CloudTrailClient, LookupEventsCommand } from '@aws-sdk/client-cloudtrail';
import { DateTime } from 'luxon';
import Request from '../models/Request.js';
import SessionLog from '../models/SessionLog.js';
import {
  evaluateDailyUsageAccess,
  computeMagicLinkDurationSeconds,
  getRequestTimezone,
} from '../utils/usageWindowAccess.js';
import {
  endUsageSessionIfActive,
  startUsageSession,
  userIdFromIndex,
} from './usageService.js';
import {
  expireMagicLinkSessionsForUser,
  startDirectIamSession,
  expireTimedOutSessionLogsForRequest,
  closeOrphanOpenUsageSessions,
  endIdleSessionLogsForRequest,
} from './sessionTrackingService.js';

const cloudTrailCredentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

export function getIdleMinutes() {
  return Number(process.env.AWS_SESSION_IDLE_MINUTES || 5);
}

export function getSessionStartLookbackMinutes() {
  const idleMinutes = getIdleMinutes();
  const configured = Number(process.env.AWS_SESSION_START_LOOKBACK_MINUTES);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.min(configured, idleMinutes);
  }
  return Math.min(idleMinutes, 3);
}

export function isRecentActivityEvent(eventTime, now = new Date()) {
  const eventAt = eventTime instanceof Date ? eventTime : new Date(eventTime);
  const cutoffMs = getSessionStartLookbackMinutes() * 60 * 1000;
  return eventAt.getTime() >= now.getTime() - cutoffMs;
}

function cloudTrailClientForRegion(region) {
  return new CloudTrailClient({
    region,
    credentials: cloudTrailCredentials,
  });
}

function getActiveTrackingRequestsQuery() {
  const now = new Date();
  return {
    status: 'Completed',
    startDate: { $lte: now },
    endDate: { $gte: now },
  };
}

function resolveCloudTrailRegions(requests) {
  const regions = new Set(['us-east-1']);

  if (process.env.AWS_REGION) {
    regions.add(process.env.AWS_REGION);
  }

  for (const request of requests) {
    if (request.region) {
      regions.add(request.region);
    }
    // Console activity for regional services is often logged in us-west-2 / home region.
    regions.add('us-west-2');
  }

  return [...regions];
}

async function lookupConsoleLoginEvents(regions, since) {
  const events = [];
  const seenEventIds = new Set();

  for (const region of regions) {
    try {
      const response = await cloudTrailClientForRegion(region).send(
        new LookupEventsCommand({
          LookupAttributes: [{ AttributeKey: 'EventName', AttributeValue: 'ConsoleLogin' }],
          StartTime: since,
          EndTime: new Date(),
          MaxResults: 50,
        })
      );

      for (const wrapper of response.Events || []) {
        const eventId = wrapper.EventId;
        if (eventId && seenEventIds.has(eventId)) continue;
        if (eventId) seenEventIds.add(eventId);
        events.push(wrapper);
      }
    } catch (err) {
      console.warn(`[ConsoleLoginMonitor] CloudTrail lookup failed in ${region}:`, err.message);
    }
  }

  return events;
}

async function lookupEventsByUsername(regions, username, since) {
  const events = [];

  for (const region of regions) {
    try {
      const response = await cloudTrailClientForRegion(region).send(
        new LookupEventsCommand({
          LookupAttributes: [{ AttributeKey: 'Username', AttributeValue: username }],
          StartTime: since,
          EndTime: new Date(),
          MaxResults: 20,
        })
      );

      for (const wrapper of response.Events || []) {
        if (!wrapper.CloudTrailEvent) continue;
        try {
          events.push(JSON.parse(wrapper.CloudTrailEvent));
        } catch {
          // ignore malformed events
        }
      }
    } catch (err) {
      console.warn(
        `[ConsoleLoginMonitor] Username activity lookup failed for ${username} in ${region}:`,
        err.message
      );
    }
  }

  return events;
}

async function lookupRecentUserEvents(regions, since) {
  const events = [];

  for (const region of regions) {
    try {
      const response = await cloudTrailClientForRegion(region).send(
        new LookupEventsCommand({
          StartTime: since,
          EndTime: new Date(),
          MaxResults: 50,
        })
      );

      for (const wrapper of response.Events || []) {
        if (!wrapper.CloudTrailEvent) continue;
        try {
          events.push(JSON.parse(wrapper.CloudTrailEvent));
        } catch {
          // ignore malformed events
        }
      }
    } catch (err) {
      console.warn(`[ConsoleLoginMonitor] Activity lookup failed in ${region}:`, err.message);
    }
  }

  return events;
}

function buildConsoleUserLookupMap(requests) {
  const lookup = new Map();

  for (const request of requests) {
    for (const role of request.labRoles || []) {
      if (!role.roleName) continue;

      lookup.set(role.roleName.toLowerCase(), {
        requestId: String(request._id),
        userIndex: role.userIndex,
        userId: userIdFromIndex(role.userIndex),
        username: userIdFromIndex(role.userIndex),
        roleName: role.roleName,
        accessType: 'magic_link',
        cloudTrailUsernames: [role.roleName.toLowerCase(), userIdFromIndex(role.userIndex).toLowerCase()],
      });
    }

    for (const user of request.identityUsers || []) {
      if (!user.username) continue;

      lookup.set(user.username.toLowerCase(), {
        requestId: String(request._id),
        userIndex: user.userIndex,
        userId: user.userId || user.username,
        username: user.username,
        accessType: 'identity_center',
        cloudTrailUsernames: [user.username.toLowerCase()],
      });
    }
  }

  return lookup;
}

function resolveUserFromEvent(event, userLookup) {
  const userName = event?.userIdentity?.userName || '';
  if (userName) {
    const byUsername = userLookup.get(userName.toLowerCase());
    if (byUsername) {
      return byUsername;
    }
  }

  const arn = event?.userIdentity?.arn || '';
  const sessionContext = event?.userIdentity?.sessionContext?.sessionIssuer?.userName || '';
  const candidates = [arn, sessionContext].filter(Boolean);

  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();
    for (const [key, userInfo] of userLookup.entries()) {
      if (lower.includes(`/${key}/`) || lower.includes(`/${key}`) || lower.endsWith(`:user/${key}`)) {
        return userInfo;
      }
    }
  }

  const sessionName =
    event?.userIdentity?.sessionContext?.sessionIssuer?.userName ||
    event?.userIdentity?.userName ||
    '';

  const rackoMatch = String(sessionName).match(/racko-(?:lab-|admin-)?u(\d+)/i);
  if (rackoMatch) {
    const userIndex = Number(rackoMatch[1]) - 1;
    for (const userInfo of userLookup.values()) {
      if (userInfo.userIndex === userIndex) {
        return userInfo;
      }
    }
  }

  return null;
}

const BACKGROUND_CONSOLE_EVENTS = new Set([
  'ListManagedNotificationEvents',
  'GetAccountColor',
  'GetAccountPlanState',
  'GetSigninToken',
]);

function isTrackableActivityEvent(event) {
  if (!event || event.errorCode || event.errorMessage) {
    return false;
  }

  if (event.eventName === 'ConsoleLogin') {
    return event.responseElements?.ConsoleLogin === 'Success';
  }

  if (BACKGROUND_CONSOLE_EVENTS.has(String(event.eventName || ''))) {
    return false;
  }

  const source = String(event.eventSource || '');
  return source.endsWith('.amazonaws.com');
}

async function isEventProcessed(requestId, eventId) {
  const request = await Request.findById(requestId).select('processedCloudTrailEvents').lean();
  return (request?.processedCloudTrailEvents || []).some((entry) => entry.eventId === eventId);
}

async function markEventProcessed(requestId, eventId, userId) {
  await Request.findByIdAndUpdate(requestId, {
    $push: {
      processedCloudTrailEvents: {
        eventId,
        userId,
        processedAt: new Date(),
      },
    },
    updatedAt: new Date(),
  });
}

async function hasOpenSession(requestId, userInfo) {
  const request = await Request.findById(requestId).select('usageSessions').lean();
  const openUsageSession = (request?.usageSessions || []).some(
    (session) => session.userId === userInfo.userId && !session.logoutAt
  );
  if (openUsageSession) {
    return true;
  }

  const activeSessionLog = await SessionLog.exists({
    requestId,
    userIndex: userInfo.userIndex,
    status: 'active',
  });

  return Boolean(activeSessionLog);
}

async function ensureUserSessionStarted(request, userInfo, startedAt, { source = 'cloudtrail' } = {}) {
  if (await hasOpenSession(String(request._id), userInfo)) {
    return false;
  }

  const access = evaluateDailyUsageAccess(request, userInfo.userId, startedAt);
  if (!access.allowed) {
    console.log(
      `[ConsoleLoginMonitor] Session denied for ${userInfo.username} (${source}): ${access.reason}`
    );
    return false;
  }

  if (userInfo.accessType === 'identity_center') {
    const durationSeconds = computeMagicLinkDurationSeconds(request, userInfo.userId, startedAt);
    const expiresAt =
      durationSeconds > 0 ? new Date(startedAt.getTime() + durationSeconds * 1000) : null;

    await startDirectIamSession(userInfo.requestId, userInfo.userIndex, startedAt, expiresAt);
  } else {
    await endUsageSessionIfActive({
      requestId: userInfo.requestId,
      userId: userInfo.userId,
    }).catch(() => null);

    await startUsageSession({
      requestId: userInfo.requestId,
      userId: userInfo.userId,
      username: userInfo.username,
      loginAt: startedAt,
    });
  }

  console.log(
    `[ConsoleLoginMonitor] Session started for ${userInfo.username} at ${startedAt.toISOString()} (${source})`
  );
  return true;
}

async function startSessionsFromEvents(events, userLookup, { dedupeEvents = false } = {}) {
  let sessionsCreated = 0;

  for (const event of events) {
    if (!isTrackableActivityEvent(event)) continue;

    const userInfo = resolveUserFromEvent(event, userLookup);
    if (!userInfo) continue;

    const eventId = event.eventID;
    if (dedupeEvents && eventId) {
      if (await isEventProcessed(userInfo.requestId, eventId)) {
        continue;
      }
    }

    const request = await Request.findById(userInfo.requestId);
    if (!request) continue;

    const activityTime = new Date(event.eventTime || Date.now());
    if (!isRecentActivityEvent(activityTime)) {
      continue;
    }

    const started = await ensureUserSessionStarted(request, userInfo, activityTime, {
      source: event.eventName === 'ConsoleLogin' ? 'console_login' : 'api_activity',
    });

    if (!started) continue;

    if (dedupeEvents && eventId) {
      await markEventProcessed(userInfo.requestId, eventId, userInfo.userId);
    }

    sessionsCreated += 1;
  }

  return sessionsCreated;
}

function buildActiveUserKeysFromEvents(events, userLookup) {
  const activeUsers = new Set();

  for (const event of events) {
    const userInfo = resolveUserFromEvent(event, userLookup);
    if (userInfo) {
      activeUsers.add(`${userInfo.requestId}:${userInfo.userIndex}`);
    }
  }

  return activeUsers;
}

export async function reconcileIdleSessionsForRequest(requestId) {
  const idleMinutes = getIdleMinutes();
  const now = new Date();

  const request = await Request.findById(requestId).lean();
  if (!request || request.status !== 'Completed') {
    return { ended: 0, closedOrphans: 0, expired: 0 };
  }

  const expired = await expireTimedOutSessionLogsForRequest(requestId, now);

  if (idleMinutes <= 0) {
    return { ended: 0, closedOrphans: 0, expired };
  }

  const userLookup = buildConsoleUserLookupMap([request]);
  const regions = resolveCloudTrailRegions([request]);
  const since = new Date(now.getTime() - idleMinutes * 60 * 1000);
  const recentEvents = await lookupRecentUserEvents(regions, since);
  const activeUserKeys = buildActiveUserKeysFromEvents(recentEvents, userLookup);

  const ended = await endIdleSessionLogsForRequest(requestId, {
    activeUserKeys,
    idleMinutes,
    now,
  });
  const closedOrphans = await closeOrphanOpenUsageSessions(requestId, {
    activeUserKeys,
    idleMinutes,
    now,
  });

  return { ended, closedOrphans, expired };
}

export async function syncRecentActivityForRequest(requestId) {
  const request = await Request.findById(requestId).lean();
  if (!request || request.status !== 'Completed') {
    return { synced: 0 };
  }

  const userLookup = buildConsoleUserLookupMap([request]);
  if (!userLookup.size) {
    return { synced: 0 };
  }

  const lookbackMinutes = getSessionStartLookbackMinutes();
  const now = new Date();
  const since = new Date(now.getTime() - lookbackMinutes * 60 * 1000);
  const regions = resolveCloudTrailRegions([request]);
  let synced = 0;

  for (const userInfo of userLookup.values()) {
    if (await hasOpenSession(String(request._id), userInfo)) {
      continue;
    }

    const usernames = [...new Set(userInfo.cloudTrailUsernames || [userInfo.username.toLowerCase()])];
    let latestEvent = null;

    for (const username of usernames) {
      const events = await lookupEventsByUsername(regions, username, since);
      for (const event of events) {
        if (!isTrackableActivityEvent(event)) continue;
        const eventTime = new Date(event.eventTime || Date.now());
        if (!isRecentActivityEvent(eventTime, now)) continue;
        if (!latestEvent || eventTime > new Date(latestEvent.eventTime || 0)) {
          latestEvent = event;
        }
      }
    }

    if (!latestEvent) continue;

    const hydratedRequest = await Request.findById(requestId);
    if (!hydratedRequest) continue;

    const started = await ensureUserSessionStarted(
      hydratedRequest,
      userInfo,
      new Date(latestEvent.eventTime || Date.now()),
      { source: 'org_admin_sync' }
    );

    if (started) {
      synced += 1;
    }
  }

  return { synced };
}

export async function monitorAwsUserActivity() {
  const requests = await Request.find(getActiveTrackingRequestsQuery()).lean();
  if (!requests.length) {
    return { checked: 0, sessionsCreated: 0 };
  }

  const userLookup = buildConsoleUserLookupMap(requests);
  if (!userLookup.size) {
    return { checked: 0, sessionsCreated: 0 };
  }

  const lookbackMinutes = getSessionStartLookbackMinutes();
  const now = new Date();
  const since = new Date(now.getTime() - lookbackMinutes * 60 * 1000);
  const regions = resolveCloudTrailRegions(requests);
  const recentEvents = await lookupRecentUserEvents(regions, since);
  const sessionsFromEvents = await startSessionsFromEvents(recentEvents, userLookup);

  let sessionsFromUsers = 0;
  for (const userInfo of userLookup.values()) {
    if (await hasOpenSession(userInfo.requestId, userInfo)) {
      continue;
    }

    const usernames = [...new Set(userInfo.cloudTrailUsernames || [userInfo.username.toLowerCase()])];
    let latestEvent = null;

    for (const username of usernames) {
      const events = await lookupEventsByUsername(regions, username, since);
      for (const event of events) {
        if (!isTrackableActivityEvent(event)) continue;
        const eventTime = new Date(event.eventTime || Date.now());
        if (!isRecentActivityEvent(eventTime, now)) continue;
        if (!latestEvent || eventTime > new Date(latestEvent.eventTime || 0)) {
          latestEvent = event;
        }
      }
    }

    if (!latestEvent) continue;

    const request = await Request.findById(userInfo.requestId);
    if (!request) continue;

    const started = await ensureUserSessionStarted(
      request,
      userInfo,
      new Date(latestEvent.eventTime || Date.now()),
      { source: 'username_activity' }
    );

    if (started) {
      sessionsFromUsers += 1;
    }
  }

  return {
    checked: userLookup.size,
    sessionsCreated: sessionsFromEvents + sessionsFromUsers,
  };
}

export async function monitorAwsConsoleLogins() {
  const requests = await Request.find(getActiveTrackingRequestsQuery()).lean();

  if (!requests.length) {
    return { fetched: 0, sessionsCreated: 0 };
  }

  const userLookup = buildConsoleUserLookupMap(requests);
  if (!userLookup.size) {
    return { fetched: 0, sessionsCreated: 0 };
  }

  const lookbackMinutes = Number(process.env.AWS_SIGNIN_MONITOR_LOOKBACK_MINUTES || 60);
  const since = new Date(Date.now() - lookbackMinutes * 60 * 1000);
  const regions = resolveCloudTrailRegions(requests);

  const wrappers = await lookupConsoleLoginEvents(regions, since);
  if (!wrappers.length) {
    return { fetched: 0, sessionsCreated: 0, regions };
  }

  const events = wrappers
    .map((wrapper) => {
      if (!wrapper.CloudTrailEvent) return null;
      try {
        return JSON.parse(wrapper.CloudTrailEvent);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const sessionsCreated = await startSessionsFromEvents(events, userLookup, { dedupeEvents: true });

  return { fetched: wrappers.length, sessionsCreated, regions };
}

export async function monitorIdleUsageSessions() {
  const idleMinutes = getIdleMinutes();
  if (idleMinutes <= 0) {
    return { ended: 0 };
  }

  const [activeSessionLogs, requestsWithOpenUsage] = await Promise.all([
    SessionLog.find({ status: 'active' }),
    Request.find({
      status: 'Completed',
      usageSessions: { $elemMatch: { logoutAt: null } },
    })
      .select('_id')
      .lean(),
  ]);

  const requestIds = [
    ...new Set([
      ...activeSessionLogs.map((session) => String(session.requestId)),
      ...requestsWithOpenUsage.map((request) => String(request._id)),
    ]),
  ];

  if (!requestIds.length) {
    return { ended: 0 };
  }

  const requests = await Request.find({
    _id: { $in: requestIds },
    status: 'Completed',
  }).lean();

  if (!requests.length) {
    return { ended: 0 };
  }

  const userLookup = buildConsoleUserLookupMap(requests);
  const regions = resolveCloudTrailRegions(requests);
  const now = new Date();
  const since = new Date(now.getTime() - idleMinutes * 60 * 1000);
  const recentEvents = await lookupRecentUserEvents(regions, since);
  const activeUserKeys = buildActiveUserKeysFromEvents(recentEvents, userLookup);

  let ended = 0;
  let closedOrphans = 0;

  for (const request of requests) {
    const requestId = String(request._id);
    await expireTimedOutSessionLogsForRequest(requestId, now);
    ended += await endIdleSessionLogsForRequest(requestId, {
      activeUserKeys,
      idleMinutes,
      now,
    });
    closedOrphans += await closeOrphanOpenUsageSessions(requestId, {
      activeUserKeys,
      idleMinutes,
      now,
    });
  }

  return { ended, closedOrphans };
}

export async function monitorStaleSessions() {
  const requests = await Request.find({
    status: 'Completed',
    'usageSessions.logoutAt': null,
  });

  const staleMinutes = Number(process.env.AWS_SESSION_STALE_MINUTES || 480);

  for (const request of requests) {
    const timezone = getRequestTimezone(request);
    const now = DateTime.now().setZone(timezone);

    for (const session of request.usageSessions || []) {
      if (session.logoutAt) continue;

      const loginAt = DateTime.fromJSDate(new Date(session.loginAt)).setZone(timezone);
      const elapsed = now.diff(loginAt, 'minutes').minutes;

      if (elapsed >= staleMinutes) {
        const sessionIndex = request.usageSessions.findIndex(
          (entry) => String(entry._id) === String(session._id)
        );
        if (sessionIndex >= 0) {
          await Request.updateOne(
            { _id: request._id },
            {
              $set: {
                [`usageSessions.${sessionIndex}.logoutAt`]: new Date(),
                [`usageSessions.${sessionIndex}.minutesUsed`]: Math.ceil(elapsed),
                updatedAt: new Date(),
              },
            }
          );
        }
      }
    }
  }
}
