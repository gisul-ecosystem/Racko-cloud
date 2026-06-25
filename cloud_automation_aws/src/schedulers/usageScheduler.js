import cron from 'node-cron';
import { DateTime } from 'luxon';
import Request from '../models/Request.js';
import {
  disableIamUser,
  getProvisionedUsers,
  getTodayWindowForRequest,
  getUserDailyLimitState,
} from '../utils/provisionedUsers.js';

let usageMonitorTask = null;
let dailyResetTask = null;

const logEvent = (level, event, details = {}) => {
  const entry = {
    timestamp: new Date().toISOString(),
    service: 'usage-scheduler',
    level,
    event,
    ...details,
  };

  const message = JSON.stringify(entry);
  if (level === 'error') {
    console.error(message);
    return;
  }
  console.log(message);
};

function getRequestTimezone(request) {
  const windows = request.usageWindows || [];
  return windows[0]?.timezone || request.timezone || 'Asia/Kolkata';
}

function getDailyLimitHours(request, nowInTz) {
  const todayWindow = getTodayWindowForRequest(request, nowInTz);
  if (!todayWindow) {
    return null;
  }
  return todayWindow.dailyLimitHours ?? todayWindow.daily_limit_hours ?? null;
}

function sumConsumedMinutesToday(sessions, todayDate, timezone) {
  const dayStart = DateTime.fromISO(todayDate, { zone: timezone }).startOf('day');
  const dayEnd = dayStart.endOf('day');

  let total = 0;
  for (const session of sessions) {
    const loginAt = DateTime.fromJSDate(new Date(session.loginAt)).setZone(timezone);
    if (loginAt < dayStart || loginAt > dayEnd) {
      continue;
    }

    const logoutAt = session.logoutAt
      ? DateTime.fromJSDate(new Date(session.logoutAt)).setZone(timezone)
      : DateTime.now().setZone(timezone);

    total += logoutAt.diff(loginAt, 'minutes').minutes;
  }

  return Math.max(0, total);
}

async function handleDailyLimitReached(request, user, consumedMinutes, dailyLimitHours) {
  disableIamUser(user.userId);

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
    `[UsageScheduler] Daily limit reached for ${user.username} — account disabled (${consumedMinutes.toFixed(1)}/${dailyLimitHours * 60} min)`
  );
  console.log('[Email] Daily limit email to', user.email || user.username);
}

async function monitorUsageSessions() {
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
    const users = getProvisionedUsers(request);

    for (const user of users) {
      const state = getUserDailyLimitState(request, user.userId);
      if (state?.dailyLimitReached) {
        continue;
      }

      console.log('[UsageScheduler] Checking CloudTrail for', user.userId);

      const openSession = (request.usageSessions || []).find(
        (session) => session.userId === user.userId && !session.logoutAt
      );

      if (!openSession) {
        const withinWindow = Boolean(getTodayWindowForRequest(request, nowInTz));
        if (withinWindow) {
          await Request.findByIdAndUpdate(request._id, {
            $push: {
              usageSessions: {
                userId: user.userId,
                username: user.username,
                loginAt: new Date(),
                logoutAt: null,
              },
            },
            updatedAt: new Date(),
          });
          logEvent('info', 'session_created_stub', {
            requestId: String(request._id),
            userId: user.userId,
          });
        }
      }

      const refreshed = await Request.findById(request._id).lean();
      const userSessions = (refreshed.usageSessions || []).filter(
        (session) => session.userId === user.userId
      );
      const consumedMinutes = sumConsumedMinutesToday(userSessions, todayDate, timezone);

      if (
        dailyLimitHours != null &&
        consumedMinutes >= dailyLimitHours * 60
      ) {
        await handleDailyLimitReached(
          refreshed,
          user,
          consumedMinutes,
          dailyLimitHours
        );
      }
    }
  }
}

async function resetDailyUsageCounters() {
  logEvent('info', 'daily_reset_started');

  const requests = await Request.find({
    status: 'Completed',
    enableDailyUsage: true,
  });

  for (const request of requests) {
    await Request.findByIdAndUpdate(request._id, {
      $set: {
        'usageUserStates.$[].dailyLimitReached': false,
        updatedAt: new Date(),
      },
    });

    logEvent('info', 'daily_reset_applied', { requestId: String(request._id) });
  }

  logEvent('info', 'daily_reset_completed', { requestCount: requests.length });
}

export function startUsageScheduler() {
  if (!usageMonitorTask) {
    usageMonitorTask = cron.schedule('* * * * *', () => {
      monitorUsageSessions().catch((err) => {
        logEvent('error', 'usage_monitor_error', { error: err.message });
      });
    });
    logEvent('info', 'usage_monitor_scheduled', { interval: 'every minute' });
  }

  if (!dailyResetTask) {
    dailyResetTask = cron.schedule('0 0 * * *', () => {
      resetDailyUsageCounters().catch((err) => {
        logEvent('error', 'daily_reset_error', { error: err.message });
      });
    });
    logEvent('info', 'daily_reset_scheduled', { interval: 'midnight' });
  }
}

export { monitorUsageSessions, resetDailyUsageCounters, handleDailyLimitReached };
