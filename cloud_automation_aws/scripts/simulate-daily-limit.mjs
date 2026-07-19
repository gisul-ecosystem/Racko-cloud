#!/usr/bin/env node
/**
 * Simulate hitting the daily usage limit for QA (without waiting the full hour).
 *
 * Usage:
 *   node scripts/simulate-daily-limit.mjs <requestIdOrSuffix> [userIndex]
 *   node scripts/simulate-daily-limit.mjs <requestIdOrSuffix> [userIndex] --apply
 *
 * With --apply:
 *   1. Backdates today's usage sessions so consumed minutes >= daily limit
 *   2. Runs the same enforcement path as the usage scheduler
 *   3. Revokes AWS console sessions + suspends/disables the lab user
 *
 * Keep the AWS console open while running --apply to verify revocation.
 */
import 'dotenv/config';
import { DateTime } from 'luxon';
import connectDB from '../src/config/db.js';
import Request from '../src/models/Request.js';
import { enforceDailyLimitsForRequest } from '../src/schedulers/usageScheduler.js';
import { attachLiveUsageToUsers } from '../src/services/userLiveUsageService.js';
import { resolveUsageUserId } from '../src/services/usageService.js';
import {
  getDailyLimitHours,
  getRequestTimezone,
  sumConsumedMinutesToday,
} from '../src/utils/usageWindowAccess.js';

const [requestArg, userIndexArg, flag] = process.argv.slice(2);

if (!requestArg) {
  console.error(
    'Usage: node scripts/simulate-daily-limit.mjs <requestIdOrSuffix> [userIndex] [--apply]'
  );
  process.exit(1);
}

const userIndex =
  userIndexArg && userIndexArg !== '--apply' ? Number(userIndexArg) : 0;
const shouldApply = flag === '--apply' || userIndexArg === '--apply';

await connectDB();

async function resolveRequestId(value) {
  if (/^[a-f0-9]{24}$/i.test(value)) {
    return value;
  }

  const requests = await Request.find({}).select('_id').lean();
  const match = requests.find((row) => String(row._id).endsWith(value.toLowerCase()));
  if (!match) {
    throw new Error(`No request found ending with "${value}"`);
  }
  return String(match._id);
}

const requestId = await resolveRequestId(requestArg);
let request = await Request.findById(requestId);
if (!request) {
  console.error('Request not found:', requestId);
  process.exit(1);
}

const userId = resolveUsageUserId(request, userIndex);
const timezone = getRequestTimezone(request);
const nowInTz = DateTime.now().setZone(timezone);
const todayDate = nowInTz.toISODate();
const dailyLimitHours = getDailyLimitHours(request, nowInTz);

if (dailyLimitHours == null) {
  console.error('This request has no daily usage limit configured for today.');
  process.exit(1);
}

const dailyLimitMinutes = dailyLimitHours * 60;

function printStatus(label, doc) {
  const sessions = (doc.usageSessions || []).filter((session) => session.userId === userId);
  const consumed = Math.round(sumConsumedMinutesToday(sessions, todayDate, timezone));
  const { users } = attachLiveUsageToUsers(doc, [
    {
      userIndex,
      userId,
      username: userId,
    },
  ]);
  const live = users[0];

  console.log(`\n--- ${label} ---`);
  console.log({
    requestId,
    userId,
    dailyLimitMinutes,
    consumedMinutes: consumed,
    remainingMinutes: live.remainingMinutes,
    hasActiveSession: live.hasActiveSession,
    dailyLimitReached: live.dailyLimitReached,
    openSessions: sessions.filter((session) => !session.logoutAt).length,
  });
}

printStatus('Before', request);

if (!shouldApply) {
  console.log('\nDry run only. Re-run with --apply to simulate limit reached and revoke sessions.');
  process.exit(0);
}

const sessions = (request.usageSessions || []).filter((session) => session.userId === userId);
const openSession = sessions.find((session) => !session.logoutAt);
const closedMinutes = sessions
  .filter((session) => session.logoutAt)
  .reduce((sum, session) => {
    const loginAt = new Date(session.loginAt);
    const logoutAt = new Date(session.logoutAt);
    return sum + Math.ceil((logoutAt - loginAt) / 60000);
  }, 0);

const targetOpenMinutes = Math.max(1, dailyLimitMinutes - closedMinutes);
const newLoginAt = new Date(Date.now() - targetOpenMinutes * 60 * 1000);

if (openSession) {
  await Request.updateOne(
    { _id: requestId, 'usageSessions._id': openSession._id },
    {
      $set: {
        'usageSessions.$.loginAt': newLoginAt,
        updatedAt: new Date(),
      },
    }
  );
  console.log(`\nAdjusted open session loginAt to ${newLoginAt.toISOString()}`);
} else {
  await Request.findByIdAndUpdate(requestId, {
    $push: {
      usageSessions: {
        userId,
        username: userId,
        loginAt: newLoginAt,
        logoutAt: null,
      },
    },
    updatedAt: new Date(),
  });
  console.log(`\nCreated synthetic open session from ${newLoginAt.toISOString()}`);
}

request = await Request.findById(requestId);
printStatus('After backdate', request);

console.log('\nRunning daily limit enforcement (same as usage scheduler)...');
await enforceDailyLimitsForRequest(request);

request = await Request.findById(requestId);
printStatus('After enforcement', request);

console.log(
  '\nIf AWS console was open, it should be revoked within ~1 minute (AWSRevokeOlderSessions policy).'
);
console.log('Refresh the org admin portal to confirm limit reached / session ended.');

process.exit(0);
