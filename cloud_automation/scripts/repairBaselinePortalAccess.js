require('dotenv').config();

const db = require('../src/db/postgres');
const roleProvisionService = require('../src/services/roleProvisionService');

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = { requestId: null, username: null, userId: null };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--request-id' && args[i + 1]) {
      options.requestId = Number(args[++i]);
    } else if (arg === '--username' && args[i + 1]) {
      options.username = args[++i];
    } else if (arg === '--user-id' && args[i + 1]) {
      options.userId = Number(args[++i]);
    }
  }

  return options;
};

const main = async () => {
  const options = parseArgs();
  if (!options.requestId) {
    throw new Error('Usage: node scripts/repairBaselinePortalAccess.js --request-id 365 [--username cust-365-user-9]');
  }

  const result = await roleProvisionService.repairBaselinePortalAccessForRequest(options.requestId, {
    username: options.username,
    userId: options.userId
  });

  console.log(JSON.stringify(result, null, 2));
  await db.end();
};

main().catch(async (error) => {
  console.error('Failed:', error.message);
  try {
    await db.end();
  } catch (_) {
    // ignore
  }
  process.exit(1);
});
