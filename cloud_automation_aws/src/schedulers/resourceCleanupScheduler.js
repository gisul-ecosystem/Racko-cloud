import cron from 'node-cron';
import Request from '../models/Request.js';

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

function deleteResourcesInAccount(accountId) {
  console.log('[ResourceCleanup] deleteResourcesInAccount stub for accountId:', accountId);
}

async function processResourceCleanup(request) {
  const requestId = request._id;
  logEvent('info', 'resource_cleanup_started', { requestId: String(requestId) });

  const accountIds = request.awsAccountIds?.length
    ? request.awsAccountIds
    : request.awsAccountId
      ? [request.awsAccountId]
      : request.provisionedResources?.accounts?.map((entry) => entry.awsAccountId) || [];

  for (const accountId of accountIds) {
    if (accountId) {
      deleteResourcesInAccount(accountId);
    }
  }

  const intervalHours =
    request.resourceCleanupIntervalHours || request.cleanupIntervalHours || 4;
  const now = new Date();
  const nextRun = new Date(now.getTime() + intervalHours * 60 * 60 * 1000);

  await Request.findByIdAndUpdate(requestId, {
    resourceCleanupLastRanAt: now,
    resourceCleanupNextRunAt: nextRun,
    cleanupNextRunAt: nextRun,
    $push: {
      cleanupLogs: {
        ranAt: now,
        message: 'Resource cleanup ran',
      },
    },
    updatedAt: now,
  });

  logEvent('info', 'resource_cleanup_success', {
    requestId: String(requestId),
    nextRun: nextRun.toISOString(),
  });

  console.log('[Email] Cleanup notification to', request.customerEmail);
}

async function runResourceCleanupPoll() {
  const now = new Date();
  logEvent('info', 'resource_cleanup_poll_started', { time: now.toISOString() });

  const due = await Request.find({
    status: 'Completed',
    $or: [{ enableResourceCleanup: true }, { cleanupEnabled: true }],
    $and: [
      {
        $or: [
          { resourceCleanupNextRunAt: { $lte: now } },
          { cleanupNextRunAt: { $lte: now } },
        ],
      },
    ],
    endDate: { $gte: now },
  }).sort({ resourceCleanupNextRunAt: 1, cleanupNextRunAt: 1 });

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
