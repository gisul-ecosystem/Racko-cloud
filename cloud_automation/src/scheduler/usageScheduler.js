const cron = require('node-cron');
const db = require('../db/postgres');
const usageService = require('../services/usageService');
const {
  detectActiveSignIns,
  detectEndedSessions
} = require('../services/azureSignInMonitor');
const {
  restoreAzureAccess,
  enforceScheduleViolation,
  enforceBlockedAzureUsers,
  enforceUsageLimits
} = require('../services/usageEnforcementService');
const { resetDailyCounters } = require('../services/dailyUsageResetService');
const { evaluateUsageAccess } = require('../services/usageAccessEvaluator');
const { resetDailyCountersIfNeeded } = require('../services/usageMiddlewareHelper');
const { isWindowEnforcementPaused } = require('../utils/windowEnforcementPause');
const { runScheduledJob } = require('../utils/schedulerCoordinator');

/**
 * Monitor active sessions every minute
 * Check if any session has caused user to exceed daily limit
 * Force logout if limit exceeded
 */
const monitorActiveSessions = async () => {
  try {
    console.log('Running active session monitor...');

    const sessions = await usageService.getActiveSessions();

    if (sessions.length === 0) {
      console.log('No active sessions to monitor.');
      return;
    }

    console.log(`Monitoring ${sessions.length} active session(s)`);

    for (const session of sessions) {
      const access = session.access;

      if (!access?.allowed) {
        const pauseResult = await db.query(
          `
            SELECT window_enforcement_paused_until
            FROM azure_users
            WHERE id = $1
            LIMIT 1
          `,
          [session.userId]
        );

        if (isWindowEnforcementPaused(pauseResult.rows[0])) {
          continue;
        }

        console.log(
          `[SESSION_VIOLATION] Session ${session.sessionId} for user ${session.userId}: ${access.reason}`
        );

        try {
          if (access.reason === 'limit_exceeded') {
            await usageService.forceLogoutUser({
              requestId: session.requestId,
              userId: session.userId
            });
          } else if (session.enforceInAzure) {
            await enforceScheduleViolation({
              requestId: session.requestId,
              userId: session.userId,
              reason: access.reason,
              blockedUntil: access.blockedUntil,
              message: access.message
            });
          } else {
            await usageService.forceLogoutUser({
              requestId: session.requestId,
              userId: session.userId
            });
          }
        } catch (error) {
          console.error(`[FORCE_LOGOUT] Error enforcing session ${session.sessionId}:`, error.message);
        }
      }
    }

    console.log('Active session monitor completed.');
  } catch (error) {
    console.error('Error monitoring active sessions:', error);
  }
};

/**
 * Reset daily usage counters at midnight
 * Runs daily at 00:00 (midnight) in Asia/Kolkata
 * Also restores Azure account access for blocked users
 */
const resetDailyUsageCounters = async () => {
  try {
    await resetDailyCounters();
  } catch (error) {
    console.error('[USAGE_RESET] Error resetting daily usage counters:', error);
  }
};

const restoreScheduledAccess = async () => {
  try {
    const result = await db.query(
      `
      SELECT
        au.id,
        au.request_id,
        au.azure_user_id,
        au.username,
        au.used_today_minutes,
        au.last_reset_date,
        au.blocked_until,
        r.enable_daily_usage,
        r.daily_limit_minutes,
        r.usage_schedule,
        r.enforce_in_azure
      FROM azure_users au
      JOIN requests r ON r.id = au.request_id
      WHERE r.enable_daily_usage = true
        AND r.status NOT IN ('Cancelled', 'Expired')
        AND au.blocked_until IS NOT NULL
        AND au.blocked_until <= NOW()
      `
    );

    for (const row of result.rows) {
      const refreshedUser = await resetDailyCountersIfNeeded(row, row, row.id, row.request_id);
      const access = evaluateUsageAccess({
        request: row,
        user: refreshedUser,
        currentSessionMinutes: 0
      });

      if (!access.allowed) {
        continue;
      }

      if (row.enforce_in_azure) {
        try {
          await restoreAzureAccess({
            azureUserId: row.azure_user_id,
            userId: row.id,
            requestId: row.request_id
          });
        } catch (error) {
          console.error(`[ACCESS_RESTORED] Failed for user ${row.id}:`, error.message);
          continue;
        }
      }

      await db.query(
        `
        UPDATE azure_users
        SET blocked_until = NULL, status = 'Active'
        WHERE id = $1 AND request_id = $2
        `,
        [row.id, row.request_id]
      );

      console.log(`[ACCESS_RESTORED] User ${row.id} (${row.username}) restored for scheduled window.`);
    }
  } catch (error) {
    console.error('Error restoring scheduled access:', error);
  }
};

/**
 * Start all usage-related schedulers
 */
const startUsageScheduler = () => {
  console.log('Starting usage schedulers...');

  // Every minute — detect sign-ins, end stale sessions, enforce limits.
  // Starts at :05s so it doesn't collide with other top-of-minute jobs.
  cron.schedule('5 * * * * *', async () => {
    await runScheduledJob('usage-monitor', async () => {
      console.log('[usageScheduler] Running sign-in check...');
      const signInResult = await detectActiveSignIns();
      const recentActivity =
        signInResult && typeof signInResult === 'object'
          ? signInResult.recentPortalActivityByUserId || new Map()
          : new Map();
      await detectEndedSessions(recentActivity);
      await enforceUsageLimits();
      await enforceBlockedAzureUsers();
      await restoreScheduledAccess();
      await monitorActiveSessions();
    }).catch((error) => {
      console.error('[usageScheduler] Error:', error.message);
    });
  });
  console.log('Usage monitor scheduled (every minute at :05s)');

  // Reset daily usage counters at midnight
  cron.schedule(
    '0 0 * * *',
    () => {
      resetDailyUsageCounters().catch((error) => {
        console.error('[usageScheduler] Daily reset error:', error.message);
      });
    },
    { timezone: 'Asia/Kolkata' }
  );
  console.log('Daily usage reset scheduled (00:00 Asia/Kolkata)');

  console.log('Usage schedulers started successfully.');
};

module.exports = {
  startUsageScheduler,
  monitorActiveSessions,
  resetDailyUsageCounters
};
