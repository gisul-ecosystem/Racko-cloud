require('dotenv').config();
const { DateTime } = require('luxon');
const { createGraphClient } = require('../src/services/azureSignInMonitor');
const { loadUsageWindowsByRequest, getTodayWindowConfig, evaluateWindowDailyLimitAccess } = require('../src/services/usageWindowAccessService');

const LOOKBACK = Number(process.env.SIGNIN_MONITOR_LOOKBACK_MINUTES || 10);
const TARGET_AZURE_USER_ID = 'd7cbccea-f29c-4ae2-b129-ab87ff7b11f1';

(async () => {
  const client = createGraphClient();
  const since = new Date(Date.now() - LOOKBACK * 60 * 1000).toISOString();
  const signIns = await client
    .api('/auditLogs/signIns')
    .filter(`createdDateTime ge ${since}`)
    .select('id,userId,createdDateTime,appDisplayName,resourceDisplayName,status')
    .top(999)
    .orderby('createdDateTime desc')
    .get();

  const windows = (await loadUsageWindowsByRequest([235])).get(235) || [];

  const rows = (signIns.value || [])
    .filter((s) => String(s.userId).toLowerCase() === TARGET_AZURE_USER_ID)
    .map((signIn) => {
      const loginTime = new Date(signIn.createdDateTime);
      const config = getTodayWindowConfig(windows, loginTime);
      const ist = DateTime.fromJSDate(loginTime).setZone('Asia/Kolkata');
      return {
        id: signIn.id,
        createdDateTime: signIn.createdDateTime,
        ist: ist.toISO(),
        weekday: ist.weekday,
        currentDay: ist.weekday % 7,
        windowDayOfWeek: windows[0]?.day_of_week,
        windowDayType: typeof windows[0]?.day_of_week,
        hasTodayWindow: Boolean(config?.todayWindow),
        app: signIn.appDisplayName,
        resource: signIn.resourceDisplayName,
        errorCode: signIn.status?.errorCode
      };
    });

  for (const signIn of rows) {
    const loginTime = new Date(signIn.createdDateTime);
    const access = await evaluateWindowDailyLimitAccess({
      requestId: 235,
      userId: 2334,
      windows,
      at: loginTime
    });
    signIn.access = { allowed: access.allowed, reason: access.reason, message: access.message };
  }

  console.log(JSON.stringify({ lookbackMinutes: LOOKBACK, since, signInsForUser: rows }, null, 2));
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
