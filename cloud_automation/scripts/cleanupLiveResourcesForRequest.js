#!/usr/bin/env node
/**
 * Delete live Azure resources inside RG-CUST-{requestId}* groups
 * without deleting the resource groups themselves.
 *
 * Usage:
 *   node scripts/cleanupLiveResourcesForRequest.js 365           # dry-run
 *   node scripts/cleanupLiveResourcesForRequest.js 365 --execute
 */
require('dotenv').config();

const { ResourceManagementClient } = require('@azure/arm-resources');
const { createAzureCredential, validateAzureEnv } = require('../src/config/azure');
const {
  listResourcesInResourceGroup,
  deleteResourcesInsideRG
} = require('../src/services/resourceCleanupService');
const { runWithConcurrency } = require('../src/utils/concurrency');

const REQUEST_ID = Number(process.argv[2] || 0);
const EXECUTE = process.argv.includes('--execute');

const RG_PATTERN = (requestId) => new RegExp(`^RG-CUST-${requestId}(?:-U\\d+)?$`, 'i');

async function listRequestResourceGroups(resourceClient, requestId) {
  const matched = [];

  for await (const rg of resourceClient.resourceGroups.list()) {
    const name = String(rg.name || '');
    if (RG_PATTERN(requestId).test(name)) {
      matched.push(name);
    }
  }

  matched.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return matched;
}

(async () => {
  if (!Number.isInteger(REQUEST_ID) || REQUEST_ID <= 0) {
    throw new Error('Usage: node scripts/cleanupLiveResourcesForRequest.js <requestId> [--execute]');
  }

  const azureConfig = validateAzureEnv();
  const credential = createAzureCredential(azureConfig);
  const resourceClient = new ResourceManagementClient(credential, azureConfig.subscriptionId);

  const resourceGroups = await listRequestResourceGroups(resourceClient, REQUEST_ID);

  console.log(
    JSON.stringify(
      {
        event: 'live_resource_cleanup_started',
        requestId: REQUEST_ID,
        mode: EXECUTE ? 'execute' : 'dry-run',
        resourceGroupCount: resourceGroups.length
      },
      null,
      2
    )
  );

  if (resourceGroups.length === 0) {
    console.log('No matching resource groups found in Azure.');
    process.exit(0);
  }

  const summary = [];
  let totalResources = 0;

  for (const rgName of resourceGroups) {
    let resources = [];
    try {
      resources = await listResourcesInResourceGroup(rgName);
    } catch (error) {
      summary.push({
        resourceGroup: rgName,
        error: error.message || String(error),
        resourceCount: 0,
        deletedCount: 0
      });
      continue;
    }

    totalResources += resources.length;
    summary.push({
      resourceGroup: rgName,
      resourceCount: resources.length,
      sample: resources.slice(0, 5).map((r) => ({
        name: r.name,
        type: r.type
      }))
    });
  }

  console.log(`\nFound ${totalResources} live resource(s) across ${resourceGroups.length} resource group(s).\n`);
  for (const row of summary) {
    console.log(
      `${row.resourceGroup}: ${row.error ? `ERROR — ${row.error}` : `${row.resourceCount} resource(s)`}`
    );
  }

  if (!EXECUTE) {
    console.log('\nDry-run only. Re-run with --execute to delete live resources (RGs stay).');
    process.exit(0);
  }

  console.log('\nDeleting live resources inside resource groups...\n');

  let deletedTotal = 0;
  const results = [];

  await runWithConcurrency(
    resourceGroups,
    Math.max(1, Number(process.env.RESOURCE_CLEANUP_CONCURRENCY || 6)),
    async (rgName) => {
      try {
        const deleted = await deleteResourcesInsideRG(rgName);
        deletedTotal += deleted.length;
        results.push({ resourceGroup: rgName, deletedCount: deleted.length, failed: false });
        console.log(`[ok] ${rgName}: deleted ${deleted.length} resource(s)`);
      } catch (error) {
        results.push({
          resourceGroup: rgName,
          deletedCount: 0,
          failed: true,
          error: error.message || String(error)
        });
        console.error(`[fail] ${rgName}: ${error.message || error}`);
      }
    },
    { continueOnError: true }
  );

  console.log(
    JSON.stringify(
      {
        event: 'live_resource_cleanup_finished',
        requestId: REQUEST_ID,
        resourceGroupsProcessed: resourceGroups.length,
        deletedTotal,
        results
      },
      null,
      2
    )
  );

  process.exit(results.some((row) => row.failed) ? 1 : 0);
})().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
