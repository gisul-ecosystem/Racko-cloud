const cron = require('node-cron');
const db = require('../db/postgres');
const { executeCleanupForRequest } = require('../services/resourceCleanupService');
const { sendResourceCleanupEmail } = require('../services/email/resourceCleanupEmailService');
const { createNotification, NotificationType } = require('../services/notificationService');

let scheduledTask = null;

const logEvent = (level, event, details = {}) => {
  const entry = {
    timestamp: new Date().toISOString(),
    service: 'resource-cleanup-scheduler',
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

async function processResourceCleanup(req) {
  const { id, resource_cleanup_interval_hours, customer_email } = req;
  const requestLabel = req.request_name || `Request #${id}`;

  const { rowCount } = await db.query(
    `
      UPDATE requests
      SET status = 'Resource Cleanup In Progress'
      WHERE id = $1
        AND status = 'Completed'
    `,
    [id]
  );

  if (!rowCount) {
    return;
  }

  try {
    const cleanupResult = await executeCleanupForRequest(id, 'scheduler');
    const { action, totalDeleted, affected } = cleanupResult;
    const now = new Date();
    const nextRun = new Date(now.getTime() + resource_cleanup_interval_hours * 60 * 60 * 1000);

    await db.query(
      `
        UPDATE requests
        SET status = 'Completed',
            resource_cleanup_last_ran_at = $1,
            resource_cleanup_next_run_at = $2
        WHERE id = $3
      `,
      [now.toISOString(), nextRun.toISOString(), id]
    );

    await db.query(
      `
        INSERT INTO resource_cleanup_logs
          (request_id, ran_at, resources_deleted, user_count, status, triggered_by, total_deleted)
        VALUES ($1, $2, $3, $4, 'success', 'scheduler', $5)
      `,
      [id, now.toISOString(), JSON.stringify(affected), affected.length, totalDeleted]
    );

    if (customer_email) {
      await sendResourceCleanupEmail({
        to: customer_email,
        requestName: requestLabel,
        deletedCount: totalDeleted,
        affectedCount: affected.length,
        action,
        cleanedAt: now,
        nextCleanupAt: nextRun,
        intervalHours: resource_cleanup_interval_hours
      });
    }

    await createNotification({
      type: NotificationType.CLEANUP_RAN,
      title: action === 'pause' ? 'Resource pause completed' : 'Resource cleanup completed',
      message:
        action === 'pause'
          ? `Lab #${id} resources paused — ${affected.length} resource action(s) applied`
          : `Lab #${id} resources cleaned — ${totalDeleted} resources removed`,
      requestId: id
    });

    logEvent('info', 'resource_cleanup_success', {
      requestId: id,
      action,
      affectedCount: affected.length,
      deletedCount: totalDeleted,
      nextRun: nextRun.toISOString()
    });
  } catch (err) {
    await db.query(
      `
        UPDATE requests
        SET status = 'Completed'
        WHERE id = $1
      `,
      [id]
    );

    await db.query(
      `
        INSERT INTO resource_cleanup_logs (request_id, ran_at, status, error, triggered_by)
        VALUES ($1, NOW(), 'failed', $2, 'scheduler')
      `,
      [id, err.message]
    );

    logEvent('error', 'resource_cleanup_failed', {
      requestId: id,
      error: err.message
    });
  }
}

function startResourceCleanupScheduler() {
  if (scheduledTask) {
    return;
  }

  scheduledTask = cron.schedule('*/5 * * * *', async () => {
    const now = new Date();
    logEvent('info', 'resource_cleanup_poll_started', { time: now.toISOString() });

    try {
      const { rows: dueRequests } = await db.query(
        `
          SELECT
            id,
            resource_cleanup_interval_hours,
            customer_email
          FROM requests
          WHERE status = 'Completed'
            AND resource_cleanup_enabled = TRUE
            AND resource_cleanup_next_run_at IS NOT NULL
            AND resource_cleanup_next_run_at <= NOW()
            AND COALESCE(expired, FALSE) = FALSE
            AND expiry_date > NOW()
          ORDER BY resource_cleanup_next_run_at ASC, id ASC
        `
      );

      if (dueRequests.length === 0) {
        console.log('[CleanupScheduler] No requests due for cleanup');
        logEvent('info', 'resource_cleanup_poll_completed', { processed: 0 });
        return;
      }

      for (const req of dueRequests) {
        await processResourceCleanup(req);
      }

      logEvent('info', 'resource_cleanup_poll_completed', { processed: dueRequests.length });
    } catch (err) {
      logEvent('error', 'resource_cleanup_poll_error', { error: err.message });
    }
  });

  logEvent('info', 'resource_cleanup_scheduler_started');
}

module.exports = {
  startResourceCleanupScheduler
};
