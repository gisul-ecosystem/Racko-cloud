#!/usr/bin/env node
/**
 * Delete Azure resource groups created by cloud automation (RG-CUST-*).
 *
 * Naming conventions:
 *   Shared:  RG-CUST-{requestId}
 *   Per-user: RG-CUST-{requestId}-U{userNumber}
 *
 * Usage (from cloud_automation/):
 *   node scripts/deleteCloudAutomationResourceGroups.js              # dry-run list
 *   node scripts/deleteCloudAutomationResourceGroups.js --execute     # delete all RG-CUST-*
 *   node scripts/deleteCloudAutomationResourceGroups.js --request 277 --execute
 *   node scripts/deleteCloudAutomationResourceGroups.js --older-than-days 7 --execute
 *   node scripts/deleteCloudAutomationResourceGroups.js --concurrency 20 --execute
 *
 * Safety:
 *   - Dry-run by default (no deletes until --execute)
 *   - Only matches /^RG-CUST-\d+/i
 *   - Does NOT touch other subscription RGs
 */

require('dotenv').config();

const { ResourceManagementClient } = require('@azure/arm-resources');
const { createAzureCredential, validateAzureEnv } = require('../src/config/azure');
const { runWithConcurrency } = require('../src/utils/concurrency');

const CLOUD_AUTOMATION_RG_PATTERN = /^RG-CUST-\d+/i;

const parseArgs = (argv) => {
  const args = {
    execute: false,
    requestId: null,
    olderThanDays: null,
    concurrency: Math.max(1, Number(process.env.DELETE_AZURE_CONCURRENCY || 20)),
    wait: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--execute' || arg === '-x') {
      args.execute = true;
      continue;
    }

    if (arg === '--wait') {
      args.wait = true;
      continue;
    }

    if (arg === '--request' || arg === '--request-id') {
      args.requestId = Number(argv[i + 1]);
      i += 1;
      continue;
    }

    if (arg.startsWith('--request=')) {
      args.requestId = Number(arg.split('=')[1]);
      continue;
    }

    if (arg === '--older-than-days') {
      args.olderThanDays = Number(argv[i + 1]);
      i += 1;
      continue;
    }

    if (arg.startsWith('--older-than-days=')) {
      args.olderThanDays = Number(arg.split('=')[1]);
      continue;
    }

    if (arg === '--concurrency') {
      args.concurrency = Math.max(1, Number(argv[i + 1]) || 20);
      i += 1;
      continue;
    }

    if (arg.startsWith('--concurrency=')) {
      args.concurrency = Math.max(1, Number(arg.split('=')[1]) || 20);
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      args.help = true;
    }
  }

  if (args.requestId != null && (!Number.isInteger(args.requestId) || args.requestId <= 0)) {
    throw new Error('--request must be a positive integer request id');
  }

  if (
    args.olderThanDays != null &&
    (!Number.isFinite(args.olderThanDays) || args.olderThanDays < 0)
  ) {
    throw new Error('--older-than-days must be a non-negative number');
  }

  return args;
};

const matchesRequestFilter = (name, requestId) => {
  if (!requestId) {
    return true;
  }

  const shared = new RegExp(`^RG-CUST-${requestId}$`, 'i');
  const perUser = new RegExp(`^RG-CUST-${requestId}-U\\d+$`, 'i');
  return shared.test(name) || perUser.test(name);
};

const printHelp = () => {
  console.log(`
Delete cloud-automation resource groups (RG-CUST-*).

Examples:
  node scripts/deleteCloudAutomationResourceGroups.js
  node scripts/deleteCloudAutomationResourceGroups.js --execute
  node scripts/deleteCloudAutomationResourceGroups.js --request 277 --execute
  node scripts/deleteCloudAutomationResourceGroups.js --older-than-days 3 --execute
  node scripts/deleteCloudAutomationResourceGroups.js --concurrency 30 --wait --execute

Flags:
  --execute              Actually delete (default is dry-run)
  --request <id>         Only RGs for one request id
  --older-than-days <n>  Only RGs created at least N days ago
  --concurrency <n>      Parallel deletes (default 20)
  --wait                 Wait for each delete to finish (slower, safer confirmation)
  --help                 Show this help
`);
};

const listMatchingResourceGroups = async (resourceClient, { requestId, olderThanDays }) => {
  const matched = [];
  const cutoffMs =
    olderThanDays == null ? null : Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

  for await (const rg of resourceClient.resourceGroups.list()) {
    const name = String(rg.name || '');
    if (!CLOUD_AUTOMATION_RG_PATTERN.test(name)) {
      continue;
    }

    if (!matchesRequestFilter(name, requestId)) {
      continue;
    }

    if (cutoffMs != null) {
      const created = rg.createdTime ? new Date(rg.createdTime).getTime() : NaN;
      if (!Number.isFinite(created) || created > cutoffMs) {
        continue;
      }
    }

    matched.push({
      name,
      location: rg.location || null,
      provisioningState: rg.properties?.provisioningState || null,
      createdTime: rg.createdTime || null
    });
  }

  matched.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return matched;
};

const deleteOne = async (resourceClient, name, { wait }) => {
  if (wait) {
    await resourceClient.resourceGroups.beginDeleteAndWait(name);
    return 'deleted';
  }

  await resourceClient.resourceGroups.beginDelete(name);
  return 'delete-started';
};

(async () => {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const azureConfig = validateAzureEnv();
  const credential = createAzureCredential(azureConfig);
  const resourceClient = new ResourceManagementClient(credential, azureConfig.subscriptionId);

  console.log(
    JSON.stringify(
      {
        event: 'rg_cleanup_started',
        subscriptionId: azureConfig.subscriptionId,
        mode: args.execute ? 'execute' : 'dry-run',
        requestId: args.requestId,
        olderThanDays: args.olderThanDays,
        concurrency: args.concurrency,
        wait: args.wait
      },
      null,
      2
    )
  );

  const groups = await listMatchingResourceGroups(resourceClient, args);

  console.log(`\nFound ${groups.length} cloud-automation resource group(s):\n`);
  for (const rg of groups.slice(0, 50)) {
    console.log(`  - ${rg.name} (${rg.location || 'n/a'})`);
  }
  if (groups.length > 50) {
    console.log(`  ... and ${groups.length - 50} more`);
  }

  if (groups.length === 0) {
    console.log('\nNothing to delete.');
    process.exit(0);
  }

  if (!args.execute) {
    console.log(
      `\nDry-run only. Re-run with --execute to delete these ${groups.length} resource group(s).`
    );
    process.exit(0);
  }

  console.log(
    `\nDeleting ${groups.length} resource group(s) with concurrency=${args.concurrency}...`
  );

  let deleted = 0;
  let failed = 0;
  const failures = [];

  await runWithConcurrency(
    groups,
    args.concurrency,
    async (rg, index) => {
      try {
        const status = await deleteOne(resourceClient, rg.name, { wait: args.wait });
        deleted += 1;
        if ((index + 1) % 25 === 0 || index === groups.length - 1) {
          console.log(`[${index + 1}/${groups.length}] ${rg.name} → ${status}`);
        }
      } catch (error) {
        failed += 1;
        failures.push({ name: rg.name, message: error?.message || String(error) });
        console.error(`[fail] ${rg.name}: ${error?.message || error}`);
      }
    },
    { continueOnError: true }
  );

  console.log(
    JSON.stringify(
      {
        event: 'rg_cleanup_finished',
        matched: groups.length,
        deleted,
        failed,
        note: args.wait
          ? 'Deletes completed (wait mode).'
          : 'Delete operations started. Azure may take several minutes to finish removing RGs and free quota.',
        failures: failures.slice(0, 20)
      },
      null,
      2
    )
  );

  if (failed > 0) {
    process.exit(1);
  }
})().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
