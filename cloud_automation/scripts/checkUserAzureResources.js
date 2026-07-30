#!/usr/bin/env node
require('dotenv').config();

const db = require('../src/db/postgres');
const { listResourcesInResourceGroup } = require('../src/services/resourceCleanupService');
const { ComputeManagementClient } = require('@azure/arm-compute');
const { createAzureCredential, validateAzureEnv } = require('../src/config/azure');

const USERNAME = process.argv[2] || 'cust-307-user-1';

(async () => {
  const user = await db.query(
    `
      SELECT id, username, azure_resource_group_name, last_resource_count, status, request_id
      FROM azure_users
      WHERE username = $1
      LIMIT 1
    `,
    [USERNAME]
  );

  if (!user.rows.length) {
    throw new Error(`User ${USERNAME} not found`);
  }

  const u = user.rows[0];
  const rg = u.azure_resource_group_name || `RG-CUST-${u.request_id}-U1`;

  console.log(`User: ${u.username}`);
  console.log(`Request: #${u.request_id}`);
  console.log(`Resource group: ${rg}`);
  console.log(`DB status: ${u.status}`);
  console.log(`DB last resource count: ${u.last_resource_count ?? 0}`);
  console.log('');

  let resources = [];

  try {
    resources = await listResourcesInResourceGroup(rg);
  } catch (error) {
    if (/not found|404|ResourceGroupNotFound/i.test(error.message || '')) {
      console.log('Azure result: Resource group not found or has no resources.');
      console.log('Nothing is running for this user.');
      await db.end();
      return;
    }
    throw error;
  }

  console.log(`Total resources in Azure RG: ${resources.length}`);

  if (resources.length === 0) {
    console.log('\nResult: NO resources running in Azure for this user.');
    await db.end();
    return;
  }

  console.log('\nResources found:');
  for (const resource of resources) {
    console.log(`  • ${resource.name} (${resource.type})`);
  }

  const cfg = validateAzureEnv();
  const credential = createAzureCredential(cfg);
  const compute = new ComputeManagementClient(credential, cfg.subscriptionId);

  const vms = [];
  for await (const vm of compute.virtualMachines.list(rg)) {
    vms.push(vm);
  }

  if (vms.length) {
    console.log('\nVirtual machines:');
    for (const vm of vms) {
      let power = 'unknown';
      try {
        const instance = await compute.virtualMachines.instanceView(rg, vm.name);
        const powerState = instance.statuses?.find((status) =>
          status.code?.startsWith('PowerState/')
        );
        power = powerState?.code?.replace('PowerState/', '') || 'unknown';
      } catch {
        power = 'unknown';
      }
      console.log(`  • ${vm.name} — power state: ${power}`);
    }
  } else {
    console.log('\nVirtual machines: none');
  }

  console.log('\nResult: Resources still exist in Azure for this user.');
  await db.end();
})().catch(async (error) => {
  console.error('Check failed:', error.message || error);
  try {
    await db.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
