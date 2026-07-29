#!/usr/bin/env node
/**
 * Check whether Azure resources are cleaned up for all users in a lab request.
 *
 * Usage:
 *   node scripts/checkLabAzureCleanup.js [requestId]
 */
require('dotenv').config();

const db = require('../src/db/postgres');
const { listResourcesInResourceGroup } = require('../src/services/resourceCleanupService');
const { getResourceGroupNameForUser } = require('../src/services/userResourceGroupService');

const REQUEST_ID = Number(process.argv[2] || 307);

const shortType = (type) => String(type || '').split('/').pop() || type;

async function main() {
  const requestResult = await db.query(
    `
      SELECT
        id,
        project_name,
        status,
        resource_cleanup_enabled,
        resource_cleanup_action,
        resource_cleanup_last_ran_at,
        resource_cleanup_next_run_at
      FROM requests
      WHERE id = $1
    `,
    [REQUEST_ID]
  );

  if (!requestResult.rows.length) {
    throw new Error(`Request #${REQUEST_ID} not found`);
  }

  const request = requestResult.rows[0];

  const usersResult = await db.query(
    `
      SELECT
        au.id,
        au.username,
        au.azure_resource_group_name,
        au.last_resource_count,
        au.resources_synced_at
      FROM azure_users au
      WHERE au.request_id = $1
        AND COALESCE(au.is_deleted, false) = false
      ORDER BY au.user_number ASC NULLS LAST, au.username ASC
    `,
    [REQUEST_ID]
  );

  const cleanupLogs = await db.query(
    `
      SELECT id, ran_at, status, error, user_count, resources_deleted
      FROM resource_cleanup_logs
      WHERE request_id = $1
      ORDER BY ran_at DESC
      LIMIT 15
    `,
    [REQUEST_ID]
  );

  console.log(`Request #${request.id} — ${request.project_name || '—'}`);
  console.log(`Status: ${request.status}`);
  console.log(`Resource cleanup enabled: ${request.resource_cleanup_enabled}`);
  console.log(`Cleanup action: ${request.resource_cleanup_action || '—'}`);
  console.log(`Last cleanup run: ${request.resource_cleanup_last_ran_at || '—'}`);
  console.log(`Users: ${usersResult.rows.length}\n`);

  let totalRemaining = 0;
  let usersWithResources = 0;
  let usersChecked = 0;
  let usersErrored = 0;

  console.log('='.repeat(100));
  console.log(
    'User'.padEnd(22) +
      'Resource Group'.padEnd(18) +
      'DB count'.padEnd(10) +
      'Azure live'.padEnd(12) +
      'Status'
  );
  console.log('='.repeat(100));

  for (const user of usersResult.rows) {
    const rg =
      user.azure_resource_group_name ||
      (await getResourceGroupNameForUser(REQUEST_ID, user.id));

    if (!rg) {
      console.log(`${user.username.padEnd(22)}${'—'.padEnd(18)}${String(user.last_resource_count || 0).padEnd(10)}—           NO RG`);
      continue;
    }

    usersChecked += 1;
    let liveCount = 0;
    let resources = [];
    let error = null;

    try {
      resources = await listResourcesInResourceGroup(rg);
      liveCount = resources.length;
    } catch (err) {
      error = err.message || String(err);
      if (/not found|404|ResourceGroupNotFound/i.test(error)) {
        liveCount = 0;
        resources = [];
        error = null;
      } else {
        usersErrored += 1;
      }
    }

    if (error) {
      console.log(
        `${user.username.padEnd(22)}${rg.slice(0, 16).padEnd(18)}${String(user.last_resource_count || 0).padEnd(10)}ERROR       ${error}`
      );
      continue;
    }

    if (liveCount > 0) {
      usersWithResources += 1;
      totalRemaining += liveCount;
    }

    const status = liveCount === 0 ? 'CLEAN' : `${liveCount} remaining`;
    console.log(
      `${user.username.padEnd(22)}${rg.slice(0, 16).padEnd(18)}${String(user.last_resource_count || 0).padEnd(10)}${String(liveCount).padEnd(12)}${status}`
    );

    if (liveCount > 0 && liveCount <= 15) {
      for (const r of resources) {
        const name = (r.name || '').slice(0, 40);
        console.log(`    • ${name} (${shortType(r.type)})`);
      }
    } else if (liveCount > 15) {
      for (const r of resources.slice(0, 8)) {
        const name = (r.name || '').slice(0, 40);
        console.log(`    • ${name} (${shortType(r.type)})`);
      }
      console.log(`    ... and ${liveCount - 8} more`);
    }
  }

  console.log('='.repeat(100));
  console.log('\nSummary:');
  console.log(`  Users checked in Azure: ${usersChecked}`);
  console.log(`  Users still with resources: ${usersWithResources}`);
  console.log(`  Total resources remaining in Azure: ${totalRemaining}`);
  console.log(`  Fully cleaned users: ${usersChecked - usersWithResources - usersErrored}/${usersChecked}`);

  if (usersWithResources === 0 && usersErrored === 0) {
    console.log('\n✓ All Azure resource groups appear clean (0 resources found).');
  } else if (usersWithResources > 0) {
    console.log('\n✗ Cleanup NOT complete — resources still exist in Azure.');
  }

  if (cleanupLogs.rows.length) {
    console.log('\nRecent cleanup logs:');
    for (const log of cleanupLogs.rows.slice(0, 8)) {
      const deleted =
        log.resources_deleted != null
          ? Array.isArray(log.resources_deleted)
            ? log.resources_deleted.length
            : '—'
          : '—';
      console.log(
        `  • ${log.ran_at} | users=${log.user_count ?? '—'} | status=${log.status} | deleted=${deleted}${log.error ? ` | error=${log.error}` : ''}`
      );
    }
  } else {
    console.log('\nNo resource_cleanup_logs rows found for this request.');
  }

  await db.end();
}

main().catch(async (error) => {
  console.error('Check failed:', error.message || error);
  try {
    await db.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
