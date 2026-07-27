import cron from 'node-cron';
import Request from '../models/Request.js';
import { runScheduledResourceCleanupForRequest } from '../services/labExpiryCleanupService.js';
import { sendResourceCleanupEmail } from '../services/cleanupEmailService.js';
import { buildRequestLabel } from '../utils/cleanupMetrics.js';
import { createNotification } from '../services/notificationService.js';

let scheduledTask = null;

const logEvent = (level, event, details = {}) => {
  const entry = {
    timestamp: new Date().toISOString(),
    service: 'resource-cleanup-scheduler',
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

async function isRequestEligibleForCleanupEmail(requestId) {
  const request = await Request.findOne({
    _id: requestId,
    status: 'Completed',
    endDate: { $gte: new Date() },
    cleanupCompleted: { $ne: true },
    enableResourceCleanup: true,
  }).select('_id');

  return Boolean(request);
}

async function processResourceCleanup(request) {
  const requestId = request._id;
  logEvent('info', 'resource_cleanup_started', { requestId: String(requestId) });

  const result = await runScheduledResourceCleanupForRequest(request);
  const shouldEmail =
    result.customerEmail &&
    result.action !== 'pause' &&
    (await isRequestEligibleForCleanupEmail(requestId));

  if (shouldEmail) {
    try {
      await sendResourceCleanupEmail({
        to: result.customerEmail,
        requestLabel: buildRequestLabel(request),
        deletedCount: result.deletedCount,
        cleanedAt: result.cleanedAt,
        nextCleanupAt: result.nextCleanupAt,
        intervalHours: result.intervalHours,
      });
    } catch (emailErr) {
      logEvent('error', 'resource_cleanup_email_failed', {
        requestId: String(requestId),
        error: emailErr.message,
      });
    }
  } else if (result.customerEmail && result.action !== 'pause') {
    logEvent('info', 'resource_cleanup_email_skipped', {
      requestId: String(requestId),
      reason: 'request_expired_or_deleted',
    });
  }

  logEvent('info', 'resource_cleanup_success', {
    requestId: String(requestId),
    deletedCount: result.deletedCount,
    nextRun: result.nextCleanupAt.toISOString(),
  });

  const stillExists = await Request.exists({ _id: requestId });
  if (stillExists) {
    await createNotification({
      type: 'cleanup_ran',
      title: result.action === 'pause' ? 'AWS resource pause completed' : 'AWS resource cleanup completed',
      message: `Lab ${result.action || 'cleanup'} ran for ${buildRequestLabel(request)} — ${result.deletedCount} resource action(s) applied`,
      requestId,
      metadata: { deletedCount: result.deletedCount },
    });
  }
}

async function runResourceCleanupPoll() {
  const now = new Date();
  logEvent('info', 'resource_cleanup_poll_started', { time: now.toISOString() });

  const due = await Request.find({
    status: 'Completed',
    enableResourceCleanup: true,
    cleanupCompleted: { $ne: true },
    resourceCleanupNextRunAt: { $lte: now },
    endDate: { $gte: now },
  }).sort({ resourceCleanupNextRunAt: 1 });

  for (const request of due) {
    try {
      await processResourceCleanup(request);
    } catch (err) {
      logEvent('error', 'resource_cleanup_failed', {
        requestId: String(request._id),
        error: err.message,
      });

      await Request.findByIdAndUpdate(request._id, {
        $push: {
          cleanupLogs: {
            ranAt: new Date(),
            message: `Resource cleanup failed: ${err.message}`,
          },
        },
      });
    }
  }

  logEvent('info', 'resource_cleanup_poll_completed', { processed: due.length });
}

export function startResourceCleanupScheduler() {
  if (scheduledTask) {
    return;
  }

  scheduledTask = cron.schedule('*/5 * * * *', () => {
    runResourceCleanupPoll().catch((err) => {
      logEvent('error', 'resource_cleanup_poll_error', { error: err.message });
    });
  });

  logEvent('info', 'resource_cleanup_scheduler_started');
}

export { runResourceCleanupPoll, processResourceCleanup };
