#!/usr/bin/env node
require('dotenv').config();

const db = require('../src/db/postgres');
const { createGraphClient } = require('../src/provisioners/azure/userProvisioner');
const { DefaultAzureCredential } = require('@azure/identity');
const { ResourceManagementClient } = require('@azure/arm-resources');

const REQUEST_ID = 307;

async function checkGraphUsers(domain) {
  const { graphClient } = createGraphClient();
  const found = [];

  for (let n = 1; n <= 11; n += 1) {
    const username = `cust-307-user-${n}`;
    const upn = `${username}@${domain}`;
    try {
      const user = await graphClient.api(`/users/${encodeURIComponent(upn)}`).get();
      found.push({
        username,
        id: user.id,
        accountEnabled: user.accountEnabled,
        exists: true
      });
    } catch (error) {
      const status = error?.statusCode || error?.status;
      if (status === 404) {
        found.push({ username, upn, exists: false });
      } else {
        found.push({ username, upn, exists: 'error', error: error.message });
      }
    }
  }

  return found;
}

async function checkResourceGroups(subscriptionId) {
  const client = new ResourceManagementClient(new DefaultAzureCredential(), subscriptionId);
  const groups = [];

  for await (const rg of client.resourceGroups.list()) {
    if (/^RG-CUST-307-U\d+$/i.test(rg.name)) {
      groups.push({
        name: rg.name,
        location: rg.location,
        provisioningState: rg.properties?.provisioningState || null
      });
    }
  }

  groups.sort((a, b) => a.name.localeCompare(b.name));
  return groups;
}

async function countResourcesInGroup(subscriptionId, resourceGroupName) {
  const client = new ResourceManagementClient(new DefaultAzureCredential(), subscriptionId);
  let count = 0;
  const samples = [];

  try {
    for await (const resource of client.resources.listByResourceGroup(resourceGroupName)) {
      count += 1;
      if (samples.length < 5) {
        samples.push({
          name: resource.name,
          type: resource.type
        });
      }
    }
  } catch (error) {
    if (error?.statusCode === 404 || /not found/i.test(error.message || '')) {
      return { count: 0, missing: true, samples: [] };
    }
    return { count: 0, error: error.message, samples: [] };
  }

  return { count, samples };
}

(async () => {
  const subId = process.env.AZURE_SUBSCRIPTION_ID;
  if (!subId) {
    throw new Error('AZURE_SUBSCRIPTION_ID is not configured');
  }

  const dbUsers = await db.query(
    `
      SELECT username, azure_user_id, azure_resource_group_name, azure_account_enabled, status
      FROM azure_users
      WHERE request_id = $1
      ORDER BY user_number
    `,
    [REQUEST_ID]
  );

  console.log(`\n=== DB rows for request #${REQUEST_ID} (${dbUsers.rows.length} users) ===`);
  for (const row of dbUsers.rows) {
    console.log(
      `${row.username} | azure_user_id=${row.azure_user_id} | rg=${row.azure_resource_group_name} | enabled=${row.azure_account_enabled} | status=${row.status}`
    );
  }

  const { graphClient } = createGraphClient();
  const org = await graphClient.api('/organization').select('verifiedDomains').get();
  const domains = org?.verifiedDomains || [];
  const domain =
    domains.find((d) => d.isDefault)?.name ||
    domains.find((d) => d.isInitial)?.name ||
    domains[0]?.name;

  console.log(`\n=== Azure AD users (domain: ${domain}) ===`);
  const graphUsers = await checkGraphUsers(domain);
  const existingAd = graphUsers.filter((u) => u.exists === true);
  const missingAd = graphUsers.filter((u) => u.exists === false);
  console.log(`Exist in Entra ID: ${existingAd.length}`);
  console.log(`Missing from Entra ID: ${missingAd.length}`);
  if (existingAd.length) {
    console.log('Still present:', existingAd.map((u) => u.username).join(', '));
  }

  console.log(`\n=== Azure resource groups RG-CUST-307-U* ===`);
  const groups = await checkResourceGroups(subId);
  console.log(`Found ${groups.length} matching resource group(s)`);
  for (const group of groups) {
    console.log(`  ${group.name} | state=${group.provisioningState} | location=${group.location}`);
  }

  if (groups.length === 0) {
    console.log('No RG-CUST-307-* resource groups remain in the subscription.');
  } else {
    console.log(`\n=== Resources inside remaining RG-CUST-307-* groups ===`);
    for (const group of groups) {
      const resources = await countResourcesInGroup(subId, group.name);
      if (resources.missing) {
        console.log(`  ${group.name}: group not found (already gone)`);
      } else if (resources.error) {
        console.log(`  ${group.name}: error — ${resources.error}`);
      } else {
        console.log(`  ${group.name}: ${resources.count} resource(s)`);
        for (const sample of resources.samples) {
          console.log(`    - ${sample.type} / ${sample.name}`);
        }
      }
    }
  }

  console.log('\n=== Summary ===');
  console.log({
    entraUsersRemaining: existingAd.length,
    entraUsersDeleted: missingAd.length,
    resourceGroupsRemaining: groups.length,
    resourceGroupsDeleting: groups.filter((g) => g.provisioningState === 'Deleting').length,
    orgAdminShowsZeroLive: true,
    reason:
      existingAd.length === 0 && groups.length === 0
        ? 'Azure users and resource groups were deleted; org-admin 0 live is correct.'
        : existingAd.length === 0 && groups.some((g) => g.provisioningState === 'Deleting')
          ? 'Users deleted; some RGs still finishing async deletion — 0 live expected.'
          : 'Partial Azure remnants may still exist — review details above.'
  });

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
