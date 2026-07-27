require('dotenv').config();

const usageService = require('../src/services/usageService');
const { loadUsageWindowsByRequest, evaluateWindowDailyLimitAccess } = require('../src/services/usageWindowAccessService');

async function simulateGetActiveSessionsWindowAccess(requestId, userId) {
  const normalizedRequestId = Number(requestId);
  const usageWindowsByRequest = await loadUsageWindowsByRequest([normalizedRequestId]);
  const pgRow = { request_id: String(requestId), user_id: String(userId), has_usage_windows: true };
  const windows = usageWindowsByRequest.get(Number(pgRow.request_id)) || [];

  return evaluateWindowDailyLimitAccess({
    requestId: normalizedRequestId,
    userId: Number(userId),
    windows,
    at: new Date()
  });
}

(async () => {
  const requestId = process.argv[2] || 235;
  const userId = process.argv[3] || 2334;

  console.log('=== Window access (getActiveSessions path) ===');
  const access = await simulateGetActiveSessionsWindowAccess(requestId, userId);
  console.log(JSON.stringify({
    requestId: Number(requestId),
    userId: Number(userId),
    allowed: access.allowed,
    reason: access.reason,
    message: access.message,
    withinWindow: access.withinWindow
  }, null, 2));

  console.log('\n=== Active sessions from monitor ===');
  const activeSessions = await usageService.getActiveSessions();
  const forUser = activeSessions.filter(
    (session) => Number(session.requestId) === Number(requestId) && Number(session.userId) === Number(userId)
  );
  console.log(JSON.stringify(forUser, null, 2));

  process.exit(access.reason === 'day_disabled' ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
