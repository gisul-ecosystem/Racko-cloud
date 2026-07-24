const cron = require('node-cron');
const { runScheduledJob } = require('../utils/schedulerCoordinator');
const { processDuePurchaseIntentEmails } = require('../services/purchaseIntentService');

let scheduledTask = null;

const logEvent = (level, event, details = {}) => {
  const entry = {
    timestamp: new Date().toISOString(),
    service: 'purchase-intent-scheduler',
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

const runPurchaseIntentJob = async () => {
  logEvent('info', 'purchase_intent_scheduler_run_started');

  try {
    const results = await processDuePurchaseIntentEmails();
    logEvent('info', 'purchase_intent_scheduler_run_completed', {
      processed: results.length,
      successCount: results.filter((row) => row.success).length,
      failureCount: results.filter((row) => !row.success).length
    });
    return results;
  } catch (error) {
    logEvent('error', 'purchase_intent_scheduler_run_failed', {
      message: error?.message
    });
    throw error;
  }
};

const startPurchaseIntentScheduler = () => {
  if (scheduledTask) {
    return scheduledTask;
  }

  // Every 5 minutes
  scheduledTask = cron.schedule('*/5 * * * *', async () => {
    try {
      await runScheduledJob('purchase-intent-email', runPurchaseIntentJob);
    } catch (error) {
      logEvent('error', 'purchase_intent_scheduler_tick_failed', {
        message: error?.message
      });
    }
  });

  logEvent('info', 'purchase_intent_scheduler_started', {
    cron: '*/5 * * * *'
  });

  return scheduledTask;
};

module.exports = {
  startPurchaseIntentScheduler,
  runPurchaseIntentJob
};
