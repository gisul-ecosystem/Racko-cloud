#!/usr/bin/env node
/**
 * Total Azure consumption report for deleted lab request #307.
 * Pulls real billing data from Azure Cost Management per resource group.
 *
 * Usage:
 *   node scripts/reportRequest307AzureConsumption.js
 *   node scripts/reportRequest307AzureConsumption.js --json
 */
require('dotenv').config();

const { DateTime } = require('luxon');
const { queryCostForResourceGroup } = require('../src/services/azureCostManagementService');

const REQUEST_ID = 307;
const LAB_FROM = '2026-07-23';
const LAB_TO = '2026-07-28'; // day request was deleted in org-admin
const USER_COUNT = 11;
const OUTPUT_JSON = process.argv.includes('--json');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const formatMoney = (amount, currency) => {
  const symbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : `${currency} `;
  return `${symbol}${Number(amount || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

async function fetchCostWithRetry(resourceGroupName, from, to, maxAttempts = 4) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await queryCostForResourceGroup({ resourceGroupName, from, to });
    } catch (error) {
      lastError = error;
      if (/too many requests/i.test(error.message || '') && attempt < maxAttempts) {
        await sleep(4000 * attempt);
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}

(async () => {
  const rows = [];
  let currency = 'INR';

  for (let userNumber = 1; userNumber <= USER_COUNT; userNumber += 1) {
    const username = `cust-307-user-${userNumber}`;
    const resourceGroupName = `RG-CUST-307-U${userNumber}`;

    try {
      const result = await fetchCostWithRetry(resourceGroupName, LAB_FROM, LAB_TO);
      currency = result.currency || currency;
      rows.push({
        userNumber,
        username,
        resourceGroupName,
        cost: Number(result.cost || 0),
        currency: result.currency || currency,
        status: 'ok'
      });
    } catch (error) {
      rows.push({
        userNumber,
        username,
        resourceGroupName,
        cost: 0,
        currency,
        status: 'error',
        error: error.message
      });
    }

    await sleep(2000);
  }

  const successful = rows.filter((row) => row.status === 'ok');
  const failed = rows.filter((row) => row.status === 'error');
  const total = successful.reduce((sum, row) => sum + row.cost, 0);
  const average = successful.length ? total / successful.length : 0;
  const highest = successful.reduce(
    (best, row) => (row.cost > (best?.cost || 0) ? row : best),
    null
  );
  const lowest = successful.reduce(
    (best, row) => (best == null || row.cost < best.cost ? row : best),
    null
  );

  const report = {
    requestId: REQUEST_ID,
    projectName: 'Labs Azure',
    period: { from: LAB_FROM, to: LAB_TO },
    source: 'Azure Cost Management (ActualCost, per resource group)',
    note: 'Resource groups and users were deleted; billing history is retained by Azure.',
    currency,
    userCount: USER_COUNT,
    rowsQueried: rows.length,
    rowsSuccessful: successful.length,
    rowsFailed: failed.length,
    totalConsumption: Number(total.toFixed(4)),
    averagePerUser: Number(average.toFixed(4)),
    highestSpender: highest
      ? { username: highest.username, resourceGroup: highest.resourceGroupName, cost: highest.cost }
      : null,
    lowestSpender: lowest
      ? { username: lowest.username, resourceGroup: lowest.resourceGroupName, cost: lowest.cost }
      : null,
    perUser: rows.map((row) => ({
      user: row.username,
      resourceGroup: row.resourceGroupName,
      consumption: row.cost,
      currency: row.currency,
      status: row.status,
      error: row.error || null
    }))
  };

  if (OUTPUT_JSON) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('');
  console.log('='.repeat(72));
  console.log(`Azure Consumption Report — Request #${REQUEST_ID} (Labs Azure)`);
  console.log('='.repeat(72));
  console.log(`Period: ${LAB_FROM} to ${LAB_TO}`);
  console.log(`Source: Azure Cost Management (actual spend per RG)`);
  console.log(`Subscription: ${process.env.AZURE_SUBSCRIPTION_ID || '—'}`);
  console.log('');
  console.log('Per-user breakdown:');
  console.log('-'.repeat(72));
  console.log(
    `${'User'.padEnd(22)} ${'Resource Group'.padEnd(18)} ${'Consumption'.padStart(16)}`
  );
  console.log('-'.repeat(72));

  for (const row of rows) {
    const amount =
      row.status === 'ok'
        ? formatMoney(row.cost, row.currency)
        : `ERROR: ${row.error?.slice(0, 30) || 'unknown'}`;
    console.log(
      `${row.username.padEnd(22)} ${row.resourceGroupName.padEnd(18)} ${amount.padStart(16)}`
    );
  }

  console.log('-'.repeat(72));
  console.log(`${'TOTAL'.padEnd(22)} ${''.padEnd(18)} ${formatMoney(total, currency).padStart(16)}`);
  console.log(`${'AVERAGE / USER'.padEnd(22)} ${''.padEnd(18)} ${formatMoney(average, currency).padStart(16)}`);
  console.log('');
  if (highest) {
    console.log(
      `Highest: ${highest.username} (${highest.resourceGroupName}) — ${formatMoney(highest.cost, currency)}`
    );
  }
  if (lowest) {
    console.log(
      `Lowest:  ${lowest.username} (${lowest.resourceGroupName}) — ${formatMoney(lowest.cost, currency)}`
    );
  }
  if (failed.length) {
    console.log(`\nWarning: ${failed.length} resource group(s) could not be queried.`);
  }
  console.log('');
  console.log('Note: RGs and Entra users are deleted; figures are historical Azure billing only.');
  console.log('='.repeat(72));
})().catch((error) => {
  console.error('Report failed:', error.message || error);
  process.exit(1);
});
