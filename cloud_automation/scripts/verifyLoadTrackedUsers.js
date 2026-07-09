require('dotenv').config();

(async () => {
  const { loadTrackedUsers } = require('../src/services/azureSignInMonitor');

  const { trackedUsersMap } = await loadTrackedUsers();
  const request234 = [...trackedUsersMap.values()].filter((user) => Number(user.request_id) === 234);

  console.log(JSON.stringify({
    totalTracked: trackedUsersMap.size,
    request234Users: request234.map((user) => ({
      id: user.id,
      username: user.username,
      azure_user_id: user.azure_user_id,
      expiry_date: user.expiry_date,
      expires_at: user.expires_at
    })),
    nowUtc: new Date().toISOString()
  }, null, 2));

  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
