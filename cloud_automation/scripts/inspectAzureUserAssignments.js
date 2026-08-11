require('dotenv').config();
const { AuthorizationManagementClient } = require('@azure/arm-authorization');
const { ResourceManagementClient } = require('@azure/arm-resources');
const { createAzureCredential, validateAzureEnv } = require('../src/config/azure');

const requestId = Number(process.argv[2] || 365);
const username = process.argv[3] || 'cust-365-user-9';
const principalId = process.argv[4] || '2943dd9c-c3b0-4410-8fe4-fcdd34a416a7';
const rgName = process.argv[5] || 'RG-CUST-365-U9';

(async () => {
  const azureConfig = validateAzureEnv();
  const credential = createAzureCredential(azureConfig);
  const subId = azureConfig.subscriptionId;
  const scope = `/subscriptions/${subId}/resourceGroups/${rgName}`;

  const resourceClient = new ResourceManagementClient(credential, subId);
  const authClient = new AuthorizationManagementClient(credential, subId);

  try {
    const rg = await resourceClient.resourceGroups.get(rgName);
    console.log('RG exists:', rg.name, rg.location);
  } catch (error) {
    console.log('RG missing or inaccessible:', error.message);
  }

  console.log('\nRole assignments on scope for principal', principalId);
  let count = 0;
  for await (const assignment of authClient.roleAssignments.listForScope(scope)) {
    if (assignment.principalId !== principalId) continue;
    count += 1;
    console.log('-', assignment.roleDefinitionId?.split('/').pop(), assignment.principalType);
  }
  if (count === 0) {
    console.log('(none — DB says assigned but Azure has no matching assignments)');
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
