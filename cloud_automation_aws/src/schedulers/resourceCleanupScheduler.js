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

async function processResourceCleanup(request) {
  const requestId = request._id;
  logEvent('info', 'resource_cleanup_started', { requestId: String(requestId) });

  const result = await runScheduledResourceCleanupForRequest(request);

  if (result.customerEmail) {
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
  }

  logEvent('info', 'resource_cleanup_success', {
    requestId: String(requestId),
    deletedCount: result.deletedCount,
    nextRun: result.nextCleanupAt.toISOString(),
  });

  await createNotification({
    type: 'cleanup_ran',
    title: 'AWS resource cleanup completed',
    message: `Lab cleanup ran for ${buildRequestLabel(request)} — ${result.deletedCount} resource(s) removed`,
    requestId,
    metadata: { deletedCount: result.deletedCount },
  });
}

async function runResourceCleanupPoll() {
  const now = new Date();
  logEvent('info', 'resource_cleanup_poll_started', { time: now.toISOString() });

  const due = await Request.find({
    status: 'Completed',
    enableResourceCleanup: true,
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
