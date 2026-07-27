const db = require('../db/postgres');
const { dbQueryGate } = require('./dbQueryGate');

/** Base namespace for per-job PostgreSQL advisory locks. */
const ADVISORY_LOCK_NAMESPACE = 9242000;

/** Jobs that must keep running for live session / window monitoring. */
const LIVE_JOBS = new Set(['usage-monitor', 'window-enforcement']);

/** Track in-flight runs per job name (allows different jobs to overlap). */
const localJobBusy = new Map();

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

const jobLockKey = (jobName) => {
  let hash = ADVISORY_LOCK_NAMESPACE;
  const normalized = String(jobName || 'job');

  for (let index = 0; index < normalized.length; index += 1) {
    hash = (Math.imul(hash, 31) + normalized.charCodeAt(index)) >>> 0;
  }

  // Keep in signed 32-bit positive range for pg bigint advisory locks.
  return (hash % 2_000_000_000) + ADVISORY_LOCK_NAMESPACE;
};

const tryAdvisoryLock = async (lockKey) => {
  const result = await db.query('SELECT pg_try_advisory_lock($1::bigint) AS acquired', [lockKey]);
  return result.rows[0]?.acquired === true;
};

const releaseAdvisoryLock = async (lockKey) => {
  await db.query('SELECT pg_advisory_unlock($1::bigint)', [lockKey]).catch(() => {});
};

/**
 * Run a background scheduler job with per-job locking.
 *
 * - Different jobs can run in parallel (live monitor is not blocked by budget sync).
 * - The same job cannot overlap with itself (local + cluster advisory lock).
 */
const runScheduledJob = async (jobName, fn, options = {}) => {
  const resolvedName = String(jobName || 'job');
  const isLiveJob = LIVE_JOBS.has(resolvedName) || options.priority === 'live';
  const lockKey = jobLockKey(resolvedName);

  if (localJobBusy.get(resolvedName)) {
    logSchedulerEvent('scheduler_job_skipped', {
      job: resolvedName,
      reason: 'local_busy',
      live: isLiveJob
    });
    return { skipped: true, reason: 'local_busy' };
  }

  localJobBusy.set(resolvedName, true);
  let advisoryLockHeld = false;

  try {
    advisoryLockHeld = await tryAdvisoryLock(lockKey);
    if (!advisoryLockHeld) {
      logSchedulerEvent('scheduler_job_skipped', {
        job: resolvedName,
        reason: 'advisory_lock_held',
        live: isLiveJob,
        note: 'Same job still running elsewhere or from previous tick'
      });
      return { skipped: true, reason: 'advisory_lock_held' };
    }

    const startedAt = Date.now();
    await fn();
    logSchedulerEvent('scheduler_job_completed', {
      job: resolvedName,
      live: isLiveJob,
      durationMs: Date.now() - startedAt
    });
    return { skipped: false };
  } catch (error) {
    logSchedulerEvent('scheduler_job_failed', {
      job: resolvedName,
      live: isLiveJob,
      message: error?.message || String(error)
    });
    throw error;
  } finally {
    if (advisoryLockHeld) {
      await releaseAdvisoryLock(lockKey);
    }
    localJobBusy.set(resolvedName, false);
  }
};

module.exports = {
  runScheduledJob,
  dbQueryGate,
  LIVE_JOBS,
  jobLockKey
};
