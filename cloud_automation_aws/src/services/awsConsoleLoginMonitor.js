import { CloudTrailClient, LookupEventsCommand } from '@aws-sdk/client-cloudtrail';
import { DateTime } from 'luxon';
import Request from '../models/Request.js';
import SessionLog from '../models/SessionLog.js';
import { getProvisionedUsers } from '../utils/provisionedUsers.js';
import {
  evaluateDailyUsageAccess,
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
} from './sessionTrackingService.js';
import { computeMagicLinkDurationSeconds } from '../utils/usageWindowAccess.js';

const cloudTrailCredentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

function cloudTrailClientForRegion(region) {
  return new CloudTrailClient({
    region,
    credentials: cloudTrailCredentials,
  });
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

export async function monitorAwsConsoleLogins() {
  const requests = await Request.find({
    status: 'Completed',
    $or: [{ enableDailyUsage: true }, { 'usageWindows.0': { $exists: true } }],
    startDate: { $lte: new Date() },
    endDate: { $gte: new Date() },
  }).lean();

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

  const events = await lookupConsoleLoginEvents(regions, since);
  if (!events.length) {
    return { fetched: 0, sessionsCreated: 0, regions };
  }

  let sessionsCreated = 0;

  for (const wrapper of events) {
    if (!wrapper.CloudTrailEvent) continue;

    let event;
    try {
      event = JSON.parse(wrapper.CloudTrailEvent);
    } catch {
      continue;
    }

    if (event.errorCode || event.errorMessage) continue;
    if (event.responseElements?.ConsoleLogin !== 'Success') continue;

    const userInfo = resolveUserFromEvent(event, userLookup);
    if (!userInfo) continue;

    const eventId = event.eventID || wrapper.EventId;
    if (!eventId) continue;

    if (await isEventProcessed(userInfo.requestId, eventId)) {
      continue;
    }

    const request = await Request.findById(userInfo.requestId);
    if (!request) continue;

    const loginTime = new Date(event.eventTime || wrapper.EventTime || Date.now());
    const access = evaluateDailyUsageAccess(request, userInfo.userId, loginTime);

    await markEventProcessed(userInfo.requestId, eventId, userInfo.userId);

    if (!access.allowed) {
      console.log(
        `[ConsoleLoginMonitor] Login denied for ${userInfo.username}: ${access.reason}`
      );
      continue;
    }

    const openSession = (request.usageSessions || []).find(
      (session) => session.userId === userInfo.userId && !session.logoutAt
    );

    if (openSession) {
      continue;
    }

    if (userInfo.accessType === 'identity_center') {
      const durationSeconds = computeMagicLinkDurationSeconds(request, userInfo.userId, loginTime);
      const expiresAt =
        durationSeconds > 0
          ? new Date(loginTime.getTime() + durationSeconds * 1000)
          : null;

      await startDirectIamSession(userInfo.requestId, userInfo.userIndex, loginTime, expiresAt);
    } else {
      await endUsageSessionIfActive({
        requestId: userInfo.requestId,
        userId: userInfo.userId,
      }).catch(() => null);

      await startUsageSession({
        requestId: userInfo.requestId,
        userId: userInfo.userId,
        username: userInfo.username,
        loginAt: loginTime,
      });
    }

    sessionsCreated += 1;
    console.log(
      `[ConsoleLoginMonitor] Session started for ${userInfo.username} at ${loginTime.toISOString()}`
    );
  }

  return { fetched: events.length, sessionsCreated, regions };
}

export async function monitorIdleUsageSessions() {
  const idleMinutes = Number(process.env.AWS_SESSION_IDLE_MINUTES || 5);
  if (idleMinutes <= 0) {
    return { ended: 0 };
  }

  const activeSessionLogs = await SessionLog.find({ status: 'active' });
  if (!activeSessionLogs.length) {
    return { ended: 0 };
  }

  const requestIds = [...new Set(activeSessionLogs.map((session) => String(session.requestId)))];
  const requests = await Request.find({
    _id: { $in: requestIds },
    status: 'Completed',
  }).lean();

  if (!requests.length) {
    return { ended: 0 };
  }

  const userLookup = buildConsoleUserLookupMap(requests);
  const regions = resolveCloudTrailRegions(requests);
  const since = new Date(Date.now() - idleMinutes * 60 * 1000);
  const recentEvents = await lookupRecentUserEvents(regions, since);
  const activeUsers = new Set();

  for (const event of recentEvents) {
    const userInfo = resolveUserFromEvent(event, userLookup);
    if (userInfo) {
      activeUsers.add(`${userInfo.requestId}:${userInfo.userIndex}`);
    }
  }

  let ended = 0;
  const now = new Date();

  for (const sessionLog of activeSessionLogs) {
    const request = requests.find((entry) => String(entry._id) === String(sessionLog.requestId));
    if (!request) continue;

    const sessionAgeMinutes =
      (now.getTime() - new Date(sessionLog.startedAt).getTime()) / 60000;
    if (sessionAgeMinutes < idleMinutes) continue;

    const activityKey = `${String(sessionLog.requestId)}:${sessionLog.userIndex}`;
    if (activeUsers.has(activityKey)) continue;

    await expireMagicLinkSessionsForUser(sessionLog.requestId, sessionLog.userIndex, now);
    ended += 1;
    console.log(
      `[ConsoleLoginMonitor] Ended idle session for ${sessionLog.username} after ${Math.round(sessionAgeMinutes)} min`
    );
  }

  return { ended };
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
