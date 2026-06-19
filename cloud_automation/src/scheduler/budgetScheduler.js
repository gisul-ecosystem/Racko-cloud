const cron = require('node-cron');
const { runBudgetPoll } = require('../services/budgetPollingService');

let scheduledTask = null;

const DEFAULT_BUDGET_POLL_CRON = '*/15 * * * *';

const getBudgetPollCron = () => {
  const value = String(process.env.BUDGET_POLL_CRON || DEFAULT_BUDGET_POLL_CRON).trim();
  return value || DEFAULT_BUDGET_POLL_CRON;
};

const logSchedulerEvent = (level, event, details = {}) => {
  const entry = {
    timestamp: new Date().toISOString(),
    service: 'budget-scheduler',
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

const runBudgetPollJob = async () => {
  try {
    return await runBudgetPoll();
  } catch (error) {
    logSchedulerEvent('error', 'budget_poll_job_failed', {
      message: error?.message
    });

    throw error;
  }
};

const startBudgetScheduler = () => {
  if (scheduledTask) {
    return scheduledTask;
  }

  const schedule = getBudgetPollCron();

  logSchedulerEvent('info', 'budget_scheduler_started', {
    schedule
  });

  scheduledTask = cron.schedule(schedule, () => {
    runBudgetPollJob().catch((error) => {
      logSchedulerEvent('error', 'budget_poll_unhandled_error', {
        message: error?.message
      });
    });
  });

  return scheduledTask;
};

module.exports = {
  runBudgetPollJob,
  startBudgetScheduler
};
