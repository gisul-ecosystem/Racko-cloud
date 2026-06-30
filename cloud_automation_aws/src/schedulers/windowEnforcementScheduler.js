import cron from 'node-cron';
import { DateTime } from 'luxon';
import Request from '../models/Request.js';
import {
  disableIamUser,
  enableIamUser,
  getProvisionedUsers,
  getTodayWindowForRequest,
  getUserDailyLimitState,
} from '../utils/provisionedUsers.js';
import { isRequestWithinServicePeriod } from '../utils/servicePeriodAccess.js';

let scheduledTask = null;

const logEvent = (level, event, details = {}) => {
  const entry = {
    timestamp: new Date().toISOString(),
    service: 'window-enforcement-scheduler',
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

async function enforceWindowForRequest(request) {
  const users = getProvisionedUsers(request);
  if (!users.length) {
    return;
  }

  if (!isRequestWithinServicePeriod(request)) {
    let disabledCount = 0;
    for (const user of users) {
      await disableIamUser(String(request._id), user.userId);
      disabledCount += 1;
    }

    if (disabledCount) {
      logEvent('info', 'service_period_block_applied', {
        requestId: String(request._id),
        disabledCount,
        startDate: request.startDate,
        endDate: request.endDate,
      });
    }
    return;
  }

  const windows = request.usageWindows || [];
  if (!windows.length) {
    return;
  }

  const tz = windows[0].timezone || request.timezone || 'Asia/Kolkata';
  const now = DateTime.now().setZone(tz);
  const todayWindow = getTodayWindowForRequest(request, now);

  let shouldBeActive = false;
  if (todayWindow) {
    const currentTime = now.toFormat('HH:mm');
    const start =
      todayWindow.windowStartTime ??
      todayWindow.window_start_time ??
      todayWindow.startTime;
    const end =
      todayWindow.windowEndTime ?? todayWindow.window_end_time ?? todayWindow.endTime;
    shouldBeActive = currentTime >= start && currentTime < end;
  }

  let enabledCount = 0;
  let disabledCount = 0;

  for (const user of users) {
    const state = getUserDailyLimitState(request, user.userId);
    const limitReached = Boolean(
      state?.dailyLimitReached ?? user.dailyLimitReached
    );

    if (shouldBeActive && !limitReached) {
      await enableIamUser(String(request._id), user.userId);
      enabledCount += 1;
    } else {
      await disableIamUser(String(request._id), user.userId);
      disabledCount += 1;
    }
  }

  if (enabledCount || disabledCount) {
    logEvent('info', 'window_enforcement_applied', {
      requestId: String(request._id),
      shouldBeActive,
      enabledCount,
      disabledCount,
    });
  }
}

async function enforceUsageWindows() {
  const requests = await Request.find({
    status: 'Completed',
    endDate: { $gte: new Date() },
  }).lean();

  for (const request of requests) {
    try {
      await enforceWindowForRequest(request);
    } catch (err) {
      logEvent('error', 'enforce_request_failed', {
        requestId: String(request._id),
        error: err.message,
      });
    }
  }
}

export function startWindowEnforcementScheduler() {
  if (scheduledTask) {
    return;
  }

  scheduledTask = cron.schedule('* * * * *', () => {
    enforceUsageWindows().catch((err) => {
      logEvent('error', 'enforcement_poll_error', { error: err.message });
    });
  });

  logEvent('info', 'window_enforcement_scheduler_started');
}

export { enforceUsageWindows, enforceWindowForRequest };
