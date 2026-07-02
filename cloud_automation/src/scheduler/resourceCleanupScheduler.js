const cron = require('node-cron');
const db = require('../db/postgres');
const { runResourceCleanupForRequest } = require('../services/resourceCleanupService');
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
    const { deleted } = await runResourceCleanupForRequest(id);
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
        INSERT INTO resource_cleanup_logs (request_id, ran_at, resources_deleted, user_count, status)
        VALUES ($1, $2, $3, $4, 'success')
      `,
      [id, now.toISOString(), JSON.stringify(deleted), deleted.length]
    );

    if (customer_email) {
      await sendResourceCleanupEmail({
        to: customer_email,
        requestName: requestLabel,
        deletedCount: deleted.length,
        cleanedAt: now,
        nextCleanupAt: nextRun,
        intervalHours: resource_cleanup_interval_hours
      });
    }

    await createNotification({
      type: NotificationType.CLEANUP_RAN,
      title: 'Resource cleanup completed',
      message: `Lab #${id} resources cleaned — ${deleted.length} resources removed`,
      requestId: id
    });

    logEvent('info', 'resource_cleanup_success', {
      requestId: id,
      deletedCount: deleted.length,
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
        INSERT INTO resource_cleanup_logs (request_id, ran_at, status, error)
        VALUES ($1, NOW(), 'failed', $2)
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

  scheduledTask = cron.schedule('*/5 * * * *', () => {
    const now = new Date();
    logEvent('info', 'resource_cleanup_poll_started', { time: now.toISOString() });

    db.query(
      `
        SELECT
          id,
          resource_cleanup_interval_hours,
          customer_email
        FROM requests
        WHERE resource_cleanup_enabled = TRUE
          AND resource_cleanup_next_run_at IS NOT NULL
          AND resource_cleanup_next_run_at <= $1
          AND status = 'Completed'
          AND COALESCE(expired, FALSE) = FALSE
        ORDER BY resource_cleanup_next_run_at ASC, id ASC
      `,
      [now.toISOString()]
    )
      .then(async ({ rows: due }) => {
        for (const req of due) {
          await processResourceCleanup(req);
        }

        logEvent('info', 'resource_cleanup_poll_completed', { processed: due.length });
      })
      .catch((err) => {
        logEvent('error', 'resource_cleanup_poll_error', { error: err.message });
      });
  });

  logEvent('info', 'resource_cleanup_scheduler_started');
}

module.exports = {
  startResourceCleanupScheduler
};
