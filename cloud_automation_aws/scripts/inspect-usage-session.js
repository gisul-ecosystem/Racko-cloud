#!/usr/bin/env node
/**
 * Inspect and reconcile lab usage sessions for manual QA.
 *
 * Usage:
 *   node scripts/inspect-usage-session.js <requestId> [userIndex]
 *   node scripts/inspect-usage-session.js <requestId> [userIndex] --reconcile
 *
 * Fast idle testing: set AWS_SESSION_IDLE_MINUTES=1 in .env and restart cloud_automation_aws.
 */
import 'dotenv/config';
import connectDB from '../src/config/db.js';
import Request from '../src/models/Request.js';
import SessionLog from '../src/models/SessionLog.js';
import { reconcileIdleSessionsForRequest } from '../src/services/awsConsoleLoginMonitor.js';
import {
  attachLiveUsageToUsers,
} from '../src/services/userLiveUsageService.js';
import { resolveUsageUserId } from '../src/services/usageService.js';

const [requestId, userIndexArg, flag] = process.argv.slice(2);

if (!requestId) {
  console.error('Usage: node scripts/inspect-usage-session.js <requestId> [userIndex] [--reconcile]');
  process.exit(1);
}

const userIndex = userIndexArg && userIndexArg !== '--reconcile' ? Number(userIndexArg) : 0;
const shouldReconcile = flag === '--reconcile' || userIndexArg === '--reconcile';

await connectDB();

const idleMinutes = Number(process.env.AWS_SESSION_IDLE_MINUTES || 5);
console.log(`\nIdle threshold: ${idleMinutes} min (AWS_SESSION_IDLE_MINUTES)\n`);

if (shouldReconcile) {
  const result = await reconcileIdleSessionsForRequest(requestId);
  console.log('Reconcile result:', result);
}

const request = await Request.findById(requestId);
if (!request) {
  console.error('Request not found:', requestId);
  process.exit(1);
}

const userId = resolveUsageUserId(request, userIndex);
const sessionLogs = await SessionLog.find({ requestId, userIndex }).sort({ startedAt: -1 }).limit(5);
const openUsage = (request.usageSessions || []).filter(
  (session) => session.userId === userId && !session.logoutAt
);

console.log('Request:', requestId);
console.log('User:', `labuser${userIndex + 1}`, `(${userId})`);
console.log('Access type:', request.accessType || 'magic_link');
console.log('Daily usage enabled:', Boolean(request.enableDailyUsage));

console.log('\n--- Open usage session (counts toward limit) ---');
if (!openUsage.length) {
  console.log('None (offline for tracking purposes)');
} else {
  for (const session of openUsage) {
    const mins = Math.round((Date.now() - new Date(session.loginAt).getTime()) / 60000);
    console.log({
      loginAt: session.loginAt,
      liveMinutes: mins,
      logoutAt: session.logoutAt,
    });
  }
}

console.log('\n--- Recent SessionLog entries ---');
if (!sessionLogs.length) {
  console.log('None');
} else {
  for (const log of sessionLogs) {
    console.log({
      status: log.status,
      startedAt: log.startedAt,
      endedAt: log.endedAt,
      expiresAt: log.expiresAt,
      durationMins: log.durationMins,
    });
  }
}

const role =
  (request.labRoles || []).find((entry) => entry.userIndex === userIndex) ||
  (request.identityUsers || []).find((entry) => entry.userIndex === userIndex);

const { users } = attachLiveUsageToUsers(request, [
  {
    userIndex,
    userId,
    username: role?.username || `labuser${userIndex + 1}`,
  },
]);

const live = users[0];
console.log('\n--- Portal would show ---');
console.log({
  hasActiveSession: live.hasActiveSession,
  activeSessionMinutes: live.activeSessionMinutes,
  todayMinutes: live.todayMinutes,
  remainingMinutes: live.remainingMinutes,
  dailyLimitReached: live.dailyLimitReached,
});

process.exit(0);
