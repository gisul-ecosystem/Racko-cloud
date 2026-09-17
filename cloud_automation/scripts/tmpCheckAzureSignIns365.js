require('dotenv').config();
const { createGraphClient, loadTrackedUsers } = require('../src/services/azureSignInMonitor');

const REQUEST_ID = 365;

(async () => {
  const { trackedUsersMap } = await loadTrackedUsers();
  const requestUsers = [...trackedUsersMap.values()].filter(
    (u) => Number(u.request_id) === REQUEST_ID
  );

  console.log(`Tracked users for request ${REQUEST_ID}: ${requestUsers.length}`);

  const client = createGraphClient();
  const since = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

  let signIns = [];
  try {
    const response = await client
      .api('/auditLogs/signIns')
      .filter(`createdDateTime ge ${since}`)
      .select('id,userId,userPrincipalName,createdDateTime,appDisplayName,status')
      .top(999)
      .get();
    signIns = response?.value || [];
  } catch (error) {
    console.warn('signIns query failed:', error.message);
  }

  const activeInAzure = [];
  for (const signIn of signIns) {
    const uid = String(signIn.userId || '').toLowerCase();
    if (!trackedUsersMap.has(uid)) continue;
    const user = trackedUsersMap.get(uid);
    if (Number(user.request_id) !== REQUEST_ID) continue;
    if (Number(signIn.status?.errorCode ?? -1) !== 0) continue;
    activeInAzure.push({
      username: user.username,
      userPrincipalName: signIn.userPrincipalName,
      app: signIn.appDisplayName,
      at: signIn.createdDateTime
    });
  }

  console.log(JSON.stringify({ recentAzureSignIns: activeInAzure.length, users: activeInAzure }, null, 2));
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
