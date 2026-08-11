const cron = require('node-cron');
const { runScheduledJob } = require('../utils/schedulerCoordinator');
const db = require('../db/postgres');
const cleanupService = require('../services/cleanupService');
const { sendCleanupNotificationEmailWithRetry } = require('../services/email/cleanupNotificationEmailService');

let scheduledTask = null;

const logSchedulerEvent = (level, event, details = {}) => {
  const entry = {
    timestamp: new Date().toISOString(),
    service: 'cleanup-scheduler',
    level,
    event,
    ...details
  };

  const message = JSON.stringify(entry);

  if (level === 'error') {
    console.error(message);
    return;
  }

  console.log(message);
};

const isRequestEligibleForCleanupEmail = async (requestId) => {
  const result = await db.query(
    `
      SELECT id
      FROM requests
      WHERE id = $1
        AND status = 'Completed'
        AND COALESCE(expired, FALSE) = FALSE
        AND COALESCE(cleanup_completed, FALSE) = FALSE
        AND cleanup_enabled = TRUE
        AND (
          CASE
            WHEN expires_at IS NOT NULL THEN expires_at > NOW()
            ELSE expiry_date IS NULL OR expiry_date > CURRENT_DATE
          END
        )
    `,
    [requestId]
  );

  return Boolean(result.rows[0]);
};

const getDueScheduledCleanupRequests = async () => {
  const now = new Date().toISOString();

  const result = await db.query(
    `
      SELECT
        id,
        cleanup_interval_hours,
        customer_email
      FROM requests
      WHERE cleanup_enabled = TRUE
        AND next_cleanup_at IS NOT NULL
        AND next_cleanup_at <= $1
        AND COALESCE(expired, false) = FALSE
        AND COALESCE(cleanup_completed, false) = FALSE
        AND status NOT IN ('Expired', 'Cleanup In Progress', 'Cleanup Failed')
        AND status = 'Completed'
        AND (
          CASE
            WHEN expires_at IS NOT NULL THEN expires_at > NOW()
            ELSE expiry_date IS NULL OR expiry_date > CURRENT_DATE
          END
        )
      ORDER BY next_cleanup_at ASC, id ASC
    `,
    [now]
  );

  return result.rows;
};

const handleScheduledCleanup = async (requestRow) => {
  const requestId = requestRow.id;

  try {
    const result = await cleanupService.runScheduledCleanupForRequest(requestId);

    if (!result) {
      return;
    }

    const shouldEmail = await isRequestEligibleForCleanupEmail(requestId);

    if (!shouldEmail) {
      logSchedulerEvent('info', 'scheduled_cleanup_email_skipped', {
        requestId,
        reason: 'request_expired_or_deleted'
      });
    } else {
      try {
        await sendCleanupNotificationEmailWithRetry({
          to: result.customerEmail,
          requestId: result.requestId,
          requestLabel: `Request #${result.requestId}`,
          cleanedAt: result.cleanedAt,
          nextCleanupAt: result.nextCleanupAt,
          intervalHours: result.intervalHours
        });
      } catch (emailError) {
        logSchedulerEvent('error', 'scheduled_cleanup_email_failed', {
          requestId,
          message: emailError?.message
        });
      }
    }

    const nextCleanupIso =
      result.nextCleanupAt instanceof Date
        ? result.nextCleanupAt.toISOString()
        : result.nextCleanupAt
          ? new Date(result.nextCleanupAt).toISOString()
          : null;

    logSchedulerEvent('info', 'scheduled_cleanup_completed', {
      requestId,
      nextCleanupAt: nextCleanupIso
    });
  } catch (error) {
    logSchedulerEvent('error', 'scheduled_cleanup_failed', {
      requestId,
      message: error?.message
    });
  }
};

const runScheduledCleanupJob = async () => {
  logSchedulerEvent('info', 'scheduled_cleanup_poll_started');

  try {
    const dueRequests = await getDueScheduledCleanupRequests();

    for (const request of dueRequests) {
      await handleScheduledCleanup(request);
    }

    logSchedulerEvent('info', 'scheduled_cleanup_poll_completed', {
      processed: dueRequests.length
    });

    return dueRequests.length;
  } catch (error) {
    logSchedulerEvent('error', 'scheduled_cleanup_poll_failed', {
      message: error?.message
    });

    throw error;
  }
};

const startCleanupScheduler = () => {
  if (scheduledTask) {
    return scheduledTask;
  }

  logSchedulerEvent('info', 'scheduled_cleanup_scheduler_started', {
    schedule: '1-59/5 * * * *'
  });

  scheduledTask = cron.schedule('1-59/5 * * * *', () => {
    runScheduledJob('scheduled-cleanup', runScheduledCleanupJob).catch((error) => {
      logSchedulerEvent('error', 'scheduled_cleanup_unhandled_error', {
        message: error?.message
      });
    });
  });

  return scheduledTask;
};

module.exports = {
  runScheduledCleanupJob,
  startCleanupScheduler
};
