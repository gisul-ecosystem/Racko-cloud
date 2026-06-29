import cron from 'node-cron';
import { DateTime } from 'luxon';
import Request from '../models/Request.js';
import { monitorAwsConsoleLogins, monitorIdleUsageSessions, monitorStaleSessions } from '../services/awsConsoleLoginMonitor.js';
import { syncActiveMagicLinkUsageSessions } from '../services/sessionTrackingService.js';
import {
  handleDailyLimitReached,
  monitorActiveSessions,
} from '../services/usageService.js';
import {
  getProvisionedUsers,
  getUserDailyLimitState,
} from '../utils/provisionedUsers.js';
import {
  getDailyLimitHours,
  getRequestTimezone,
  sumConsumedMinutesToday,
} from '../utils/usageWindowAccess.js';

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

async function enforceDailyLimitsForRequest(request) {
  const timezone = getRequestTimezone(request);
  const nowInTz = DateTime.now().setZone(timezone);
  const todayDate = nowInTz.toISODate();
  const dailyLimitHours = getDailyLimitHours(request, nowInTz);
  if (dailyLimitHours == null) return;

  const users = getProvisionedUsers(request);

  for (const user of users) {
    const state = getUserDailyLimitState(request, user.userId);
    if (state?.dailyLimitReached) continue;

    const userSessions = (request.usageSessions || []).filter(
      (session) => session.userId === user.userId
    );
    const consumedMinutes = sumConsumedMinutesToday(userSessions, todayDate, timezone);

    if (consumedMinutes >= dailyLimitHours * 60) {
      await handleDailyLimitReached(request, user, consumedMinutes, dailyLimitHours);
    }
  }
}

async function monitorUsageSessions() {
  await monitorAwsConsoleLogins();
  await monitorIdleUsageSessions();
  await monitorActiveSessions();
  await monitorStaleSessions();

  const requests = await Request.find({
    status: 'Completed',
    $or: [{ enableDailyUsage: true }, { 'usageWindows.0': { $exists: true } }],
    startDate: { $lte: new Date() },
    endDate: { $gte: new Date() },
  }).select('_id accessType');

  for (const request of requests) {
    try {
      await syncActiveMagicLinkUsageSessions(String(request._id));
    } catch (err) {
      logEvent('error', 'magic_link_usage_sync_failed', {
        requestId: String(request._id),
        error: err.message,
      });
    }
  }

  const dailyLimitRequests = await Request.find({
    status: 'Completed',
    enableDailyUsage: true,
    startDate: { $lte: new Date() },
    endDate: { $gte: new Date() },
  });

  for (const request of dailyLimitRequests) {
    try {
      await enforceDailyLimitsForRequest(request);
    } catch (err) {
      logEvent('error', 'enforce_daily_limit_failed', {
        requestId: String(request._id),
        error: err.message,
      });
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

    const users = getProvisionedUsers(request);
    for (const user of users) {
      await Request.findOneAndUpdate(
        { _id: request._id, 'labRoles.userIndex': user.userIndex },
        {
          $set: {
            'labRoles.$.suspended': false,
            updatedAt: new Date(),
          },
        }
      );
    }

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
