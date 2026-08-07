/**
 * Reproduce provisionRolesForRequest for a request and print the real error.
 * Usage: node scripts/reproRoleProvisionError.js --request-id 363
 */
require('dotenv').config();

const db = require('../src/db/postgres');
const roleProvisionService = require('../src/services/roleProvisionService');

const requestId = Number(
  process.argv.includes('--request-id')
    ? process.argv[process.argv.indexOf('--request-id') + 1]
    : 363
);

(async () => {
  console.log(`Calling provisionRolesForRequest(${requestId})...`);
  try {
    const result = await roleProvisionService.provisionRolesForRequest(requestId);
    console.log('SUCCESS:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('THREW:');
    console.error('  name:', error?.name);
    console.error('  message:', error?.message);
    console.error('  code:', error?.code);
    console.error('  statusCode:', error?.statusCode);
    console.error('  isOperational:', error?.isOperational);
    if (error?.details) console.error('  details:', error.details);
    if (error?.body) console.error('  body:', JSON.stringify(error.body));
    console.error(error?.stack || error);
  } finally {
    await db.end();
  }
})();
