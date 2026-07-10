const db = require('../db/postgres');
const { dbQueryGate } = require('./dbQueryGate');

const ADVISORY_LOCK_KEY = 9242001;
let localSchedulerBusy = false;

const logSchedulerEvent = (event, details = {}) => {
  console.log(
    JSON.stringify({
      event,
      service: 'scheduler-coordinator',
      timestamp: new Date().toISOString(),
      ...details
    })
  );
};

const tryAdvisoryLock = async () => {
  const result = await db.query('SELECT pg_try_advisory_lock($1::bigint) AS acquired', [
    ADVISORY_LOCK_KEY
  ]);

  return result.rows[0]?.acquired === true;
};

const releaseAdvisoryLock = async () => {
  await db.query('SELECT pg_advisory_unlock($1::bigint)', [ADVISORY_LOCK_KEY]).catch(() => {});
};

/**
 * Ensures only one background scheduler poll uses the DB at a time
 * (per process + cluster-wide via PostgreSQL advisory lock).
 */
const runScheduledJob = async (jobName, fn) => {
  if (localSchedulerBusy) {
    logSchedulerEvent('scheduler_job_skipped', { job: jobName, reason: 'local_busy' });
    return { skipped: true, reason: 'local_busy' };
  }

  localSchedulerBusy = true;
  let advisoryLockHeld = false;

  try {
    advisoryLockHeld = await tryAdvisoryLock();
    if (!advisoryLockHeld) {
      logSchedulerEvent('scheduler_job_skipped', { job: jobName, reason: 'advisory_lock_held' });
      return { skipped: true, reason: 'advisory_lock_held' };
    }

    await fn();
    return { skipped: false };
  } catch (error) {
    logSchedulerEvent('scheduler_job_failed', {
      job: jobName,
      message: error?.message || String(error)
    });
    throw error;
  } finally {
    if (advisoryLockHeld) {
      await releaseAdvisoryLock();
    }
    localSchedulerBusy = false;
  }
};

module.exports = {
  runScheduledJob,
  dbQueryGate
};
