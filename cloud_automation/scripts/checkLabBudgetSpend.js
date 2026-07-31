#!/usr/bin/env node
/**
 * Check Azure actual spend vs per-user budget for all users in a lab request.
 *
 * Usage:
 *   node scripts/checkLabBudgetSpend.js [requestId]
 *   node scripts/checkLabBudgetSpend.js 307
 */
require('dotenv').config();

const db = require('../src/db/postgres');
const { queryCostForResourceGroup } = require('../src/services/azureCostManagementService');
const { getResourceGroupNameForUser } = require('../src/services/userResourceGroupService');
const { isPerUserCosting } = require('../src/utils/costingMode');

const REQUEST_ID = Number(process.argv[2] || 307);
const BUDGET_TOLERANCE = 0.02;

const formatMoney = (value, currency = 'USD') =>
  `${currency} ${Number(value || 0).toFixed(4)}`;

const pct = (spent, limit) => {
  if (!limit || limit <= 0) return '0%';
  return `${Math.min(100, Math.round((Number(spent || 0) / limit) * 100))}%`;
};

async function loadRequestUsers(requestId) {
  const requestResult = await db.query(
    `
      SELECT id, project_name, customer_email, costing_mode, per_user_budget_usd, location, status
      FROM requests
      WHERE id = $1
    `,
    [requestId]
  );

  if (!requestResult.rows.length) {
    throw new Error(`Request #${requestId} not found`);
  }

  const usersResult = await db.query(
    `
      SELECT
        au.id,
        au.username,
        au.azure_user_id,
        au.azure_resource_group_name,
        au.budget_exceeded,
        au.budget_top_up_usd,
        COALESCE(ubs.current_spend, 0) AS stored_spend,
        ubs.currency AS stored_currency,
        ubs.last_synced_at,
        ubs.sync_error
      FROM azure_users au
      LEFT JOIN user_budget_spend ubs ON ubs.azure_user_id = au.id
      WHERE au.request_id = $1
        AND COALESCE(au.is_deleted, false) = false
      ORDER BY au.user_number ASC NULLS LAST, au.username ASC
    `,
    [requestId]
  );

  return {
    request: requestResult.rows[0],
    users: usersResult.rows
  };
}

async function main() {
  console.log(`Checking Azure budget spend for request #${REQUEST_ID}...\n`);

  const { request, users } = await loadRequestUsers(REQUEST_ID);
  const perUserCosting = isPerUserCosting(request.costing_mode);
  const baseBudget = Number(request.per_user_budget_usd || 0);

  console.log(`Project: ${request.project_name || '—'}`);
  console.log(`Customer: ${request.customer_email}`);
  console.log(`Costing mode: ${request.costing_mode}${perUserCosting ? ' (per-user RG)' : ' (shared RG split)'}`);
  console.log(`Per-user budget: ${formatMoney(baseBudget)}`);
  console.log(`Users: ${users.length}\n`);

  const results = [];
  let exceededCount = 0;
  let azureTotal = 0;

  for (const user of users) {
    const budgetLimit =
      baseBudget + Number(user.budget_top_up_usd || 0);

    const resourceGroup =
      user.azure_resource_group_name ||
      (await getResourceGroupNameForUser(REQUEST_ID, user.id));

    let azureCost = 0;
    let currency = 'USD';
    let azureError = null;

    if (!resourceGroup) {
      azureError = 'No resource group linked';
    } else {
      try {
        const fresh = await queryCostForResourceGroup({ resourceGroupName: resourceGroup });
        azureCost = Number(fresh.cost || 0);
        currency = fresh.currency || 'USD';
        azureTotal += azureCost;
      } catch (error) {
        azureError = error.message || String(error);
      }
    }

    const storedSpend = Number(user.stored_spend || 0);
    const exceeded = budgetLimit > 0 && azureCost >= budgetLimit - BUDGET_TOLERANCE;
    if (exceeded) exceededCount += 1;

    results.push({
      username: user.username,
      userId: user.id,
      resourceGroup: resourceGroup || '—',
      budgetLimit,
      storedSpend,
      azureCost,
      currency,
      percent: pct(azureCost, budgetLimit),
      exceeded,
      budgetExceededFlag: user.budget_exceeded === true,
      lastSyncedAt: user.last_synced_at,
      syncError: user.sync_error,
      azureError
    });
  }

  console.log('='.repeat(110));
  console.log(
    'Username'.padEnd(22) +
      'RG'.padEnd(18) +
      'Budget'.padEnd(12) +
      'Stored'.padEnd(12) +
      'Azure MTD'.padEnd(12) +
      '%'.padEnd(8) +
      'Status'
  );
  console.log('='.repeat(110));

  for (const row of results) {
    const status = row.azureError
      ? `ERROR: ${row.azureError}`
      : row.exceeded
        ? 'EXCEEDED'
        : row.azureCost > 0
          ? 'spending'
          : 'no spend';

    console.log(
      row.username.padEnd(22) +
        String(row.resourceGroup).slice(0, 16).padEnd(18) +
        formatMoney(row.budgetLimit).padEnd(12) +
        formatMoney(row.storedSpend).padEnd(12) +
        formatMoney(row.azureCost, row.currency).padEnd(12) +
        row.percent.padEnd(8) +
        status
    );
  }

  console.log('='.repeat(110));
  console.log(`\nSummary:`);
  console.log(`  Total Azure MTD (sum of user RGs): ${formatMoney(azureTotal)}`);
  console.log(`  Users exceeded budget: ${exceededCount}/${users.length}`);
  console.log(
    `  Users with Azure spend > $0: ${results.filter((row) => row.azureCost > 0).length}/${users.length}`
  );
  console.log(
    `  Users with stored spend > $0: ${results.filter((row) => row.storedSpend > 0).length}/${users.length}`
  );

  const neverSynced = results.filter((row) => !row.lastSyncedAt);
  if (neverSynced.length) {
    console.log(`\nNote: ${neverSynced.length} user(s) have never been budget-synced in Racko DB (dashboard may show $0 until sync).`);
  }

  const syncErrors = results.filter((row) => row.syncError);
  if (syncErrors.length) {
    console.log(`Sync errors in DB:`);
    for (const row of syncErrors.slice(0, 3)) {
      console.log(`  • ${row.username}: ${row.syncError}`);
    }
  }

  if (results.every((row) => row.azureCost === 0 && !row.azureError)) {
    console.log('\nAzure Cost Management reports $0 MTD for all user resource groups.');
    console.log('This usually means users have not created billable resources yet, or billing data is still delayed (can take several hours).');
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
