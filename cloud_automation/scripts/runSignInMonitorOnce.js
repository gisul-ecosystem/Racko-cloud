require('dotenv').config();

(async () => {
  const { detectActiveSignIns } = require('../src/services/azureSignInMonitor');
  await detectActiveSignIns();
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
