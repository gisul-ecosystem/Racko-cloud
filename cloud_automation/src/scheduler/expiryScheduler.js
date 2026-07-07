const cron = require('node-cron');
const cleanupService = require('../services/cleanupService');
const db = require('../db/postgres');
const { createNotification, NotificationType } = require('../services/notificationService');

let scheduledTask = null;

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
    async () => {
      try {
        const expiringSoon = await db.query(`
          SELECT id, customer_email, location
          FROM requests
          WHERE status = 'Completed'
            AND expiry_date BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
            AND expiry_date > NOW()
            AND COALESCE(expired, false) = false
        `);

        for (const request of expiringSoon.rows) {
          await createNotification({
            type: NotificationType.LAB_EXPIRING_SOON,
            title: 'Lab expiring in 24 hours',
            message: `Lab #${request.id} for ${request.customer_email} (${request.location}) expires in less than 24 hours`,
            requestId: request.id
          });
        }
      } catch (error) {
        logSchedulerEvent('error', 'expiry_warning_scheduler_failed', {
          message: error?.message
        });
      }
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
      runExpiryCleanupJob().catch((error) => {
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

  return scheduledTask;
};

module.exports = {
  runExpiryCleanupJob,
  startExpiryScheduler
};
