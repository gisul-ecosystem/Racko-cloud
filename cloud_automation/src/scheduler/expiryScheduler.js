const cron = require('node-cron');
const cleanupService = require('../services/cleanupService');
const db = require('../db/postgres');
const { createNotification, NotificationType } = require('../services/notificationService');
const { runScheduledJob } = require('../utils/schedulerCoordinator');
const { sendLabExpiryWarningEmail } = require('../services/email/labExpiryWarningEmailService');

let scheduledTask = null;
let expiryWarningColumnReady = false;

const logSchedulerEvent = (level, event, details = {}) => {
  const entry = {
    timestamp: new Date().toISOString(),
    service: 'expiry-scheduler',
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

const ensureExpiryWarningColumn = async () => {
  if (expiryWarningColumnReady) {
    return;
  }

  await db.query(`
    ALTER TABLE requests
      ADD COLUMN IF NOT EXISTS expiry_warning_sent_at TIMESTAMPTZ
  `);
  expiryWarningColumnReady = true;
};

const runExpiryCleanupJob = async () => {
  logSchedulerEvent('info', 'cleanup_scheduler_run_started');

  try {
    const results = await cleanupService.cleanupExpiredRequests();

    logSchedulerEvent('info', 'cleanup_scheduler_run_completed', {
      processed: results.length,
      successCount: results.filter((result) => result.success).length,
      failureCount: results.filter((result) => !result.success).length
    });

    return results;
  } catch (error) {
    logSchedulerEvent('error', 'cleanup_scheduler_run_failed', {
      errorName: error?.name,
      errorCode: error?.code,
      statusCode: error?.statusCode || error?.status,
      message: error?.message
    });

    throw error;
  }
};

const runExpiryWarningJob = async () => {
  await ensureExpiryWarningColumn();

  const expiringSoon = await db.query(`
    SELECT
      id,
      customer_email,
      location,
      expiry_date,
      expires_at
    FROM requests
    WHERE status = 'Completed'
      AND COALESCE(expired, false) = false
      AND COALESCE(cleanup_completed, false) = false
      AND expiry_warning_sent_at IS NULL
      AND customer_email IS NOT NULL
      AND (
        CASE
          WHEN expires_at IS NOT NULL THEN
            expires_at > NOW()
            AND expires_at <= NOW() + INTERVAL '24 hours'
          ELSE
            expiry_date > CURRENT_DATE
            AND expiry_date <= CURRENT_DATE + INTERVAL '1 day'
        END
      )
  `);

  for (const request of expiringSoon.rows) {
    const requestLabel = `Request #${request.id}`;
    const expiresAt = request.expires_at
      ? new Date(request.expires_at).toUTCString()
      : request.expiry_date
        ? String(request.expiry_date).slice(0, 10)
        : 'within 24 hours';

    try {
      await sendLabExpiryWarningEmail({
        to: request.customer_email,
        requestLabel,
        location: request.location,
        expiresAt
      });

      await db.query(
        `
          UPDATE requests
          SET expiry_warning_sent_at = NOW()
          WHERE id = $1
            AND expiry_warning_sent_at IS NULL
        `,
        [request.id]
      );

      await createNotification({
        type: NotificationType.LAB_EXPIRING_SOON,
        title: 'Lab expiring in 24 hours',
        message: `Lab #${request.id} for ${request.customer_email} (${request.location}) expires in less than 24 hours`,
        requestId: request.id
      });

      logSchedulerEvent('info', 'expiry_warning_email_sent', { requestId: request.id });
    } catch (error) {
      logSchedulerEvent('error', 'expiry_warning_email_failed', {
        requestId: request.id,
        message: error?.message
      });
    }
  }

  return expiringSoon.rows.length;
};

const startExpiryScheduler = () => {
  if (scheduledTask) {
    return scheduledTask;
  }

  logSchedulerEvent('info', 'expiry_warning_scheduler_started', {
    schedule: '0 9 * * *',
    timezone: 'Asia/Kolkata'
  });

  cron.schedule(
    '0 9 * * *',
    () => {
      runScheduledJob('expiry-warning', runExpiryWarningJob).catch((error) => {
        logSchedulerEvent('error', 'expiry_warning_scheduler_failed', {
          message: error?.message
        });
      });
    },
    {
      timezone: 'Asia/Kolkata'
    }
  );

  logSchedulerEvent('info', 'cleanup_scheduler_started', {
    schedule: '0 2 * * *',
    timezone: 'Asia/Kolkata'
  });

  scheduledTask = cron.schedule(
    '0 2 * * *',
    () => {
      runScheduledJob('expiry-cleanup', runExpiryCleanupJob).catch((error) => {
        logSchedulerEvent('error', 'cleanup_scheduler_unhandled_error', {
          errorName: error?.name,
          errorCode: error?.code,
          statusCode: error?.statusCode || error?.status,
          message: error?.message
        });
      });
    },
    {
      timezone: 'Asia/Kolkata'
    }
  );

  ensureExpiryWarningColumn().catch((error) => {
    logSchedulerEvent('error', 'expiry_warning_column_ensure_failed', {
      message: error?.message
    });
  });

  return scheduledTask;
};

module.exports = {
  runExpiryCleanupJob,
  runExpiryWarningJob,
  startExpiryScheduler
};
