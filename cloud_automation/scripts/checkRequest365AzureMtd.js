#!/usr/bin/env node
/**
 * Check real Azure Cost Management MTD spend for request users (one subscription query).
 *
 * Usage:
 *   DATABASE_URL=... node scripts/checkRequest365AzureMtd.js
 *   DATABASE_URL=... node scripts/checkRequest365AzureMtd.js --request-id 365
 */
require('dotenv').config();

const db = require('../src/db/postgres');
const { ensureAzureManagementAccess } = require('../src/config/azure');
const axios = require('axios');

const API_VERSION = '2023-11-01';

const parseArgs = () => {
  const args = process.argv.slice(2);
  let requestId = 365;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--request-id' && args[i + 1]) {
      requestId = Number(args[++i]);
    }
  }
  return { requestId };
};

async function getSubscriptionMtdByRg() {
  const { subscriptionId, token } = await ensureAzureManagementAccess();
  const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.CostManagement/query?api-version=${API_VERSION}`;

  const now = new Date();
  const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const body = {
    type: 'ActualCost',
    timeframe: 'MonthToDate',
    dataset: {
      granularity: 'None',
      aggregation: {
        totalCost: { name: 'PreTaxCost', function: 'Sum' }
      },
      grouping: [{ type: 'Dimension', name: 'ResourceGroupName' }]
    }
  };

  // Prefer explicit MonthToDate; also send Custom window as fallback metadata in logs.
  const from = firstOfMonth.toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);

  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await axios.post(url, body, {
        headers: {
          Authorization: `Bearer ${token.token}`,
          'Content-Type': 'application/json'
        },
        timeout: 90000
      });

      const result = response.data?.properties || response.data;
      const columns = (result.columns || []).map((column) =>
        String(column.name || '').toLowerCase()
      );
      const costIdx = columns.findIndex((name) => name === 'cost' || name === 'pretaxcost');
      const rgIdx = columns.findIndex((name) => name === 'resourcegroupname');
      const currencyIdx = columns.findIndex((name) => name === 'currency');

      if (costIdx === -1 || rgIdx === -1) {
        throw new Error(`Unexpected columns: ${JSON.stringify(result.columns)}`);
      }

      const spendMap = {};
      for (const row of result.rows || []) {
        const rgName = String(row[rgIdx] || '').toLowerCase();
        spendMap[rgName] = {
          cost: Number(row[costIdx] || 0),
          currency: currencyIdx >= 0 ? String(row[currencyIdx] || 'USD') : 'USD'
        };
      }

      return { spendMap, from, to, rowCount: (result.rows || []).length };
    } catch (error) {
      lastError = error;
      const status = Number(error?.response?.status || 0);
      const message = error?.response?.data?.error?.message || error.message || String(error);
      if ((status === 429 || /too many requests/i.test(message)) && attempt < 4) {
        const waitMs = 10000 * attempt;
        console.log(`Rate limited — retry ${attempt}/4 in ${waitMs / 1000}s...`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw new Error(message);
    }
  }

  throw lastError;
}

async function main() {
  const { requestId } = parseArgs();

  const requestResult = await db.query(
    `
      SELECT id, project_name, customer_email, costing_mode, status, created_at
      FROM requests
      WHERE id = $1
    `,
    [requestId]
  );
  if (!requestResult.rows.length) {
    throw new Error(`Request #${requestId} not found`);
  }
  const request = requestResult.rows[0];

  const usersResult = await db.query(
    `
      SELECT
        au.id,
        au.user_number,
        au.username,
        au.azure_resource_group_name,
        COALESCE(ubs.current_spend, 0) AS stored_mtd,
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

  const stagingResult = await db.query(
    `
      SELECT user_number, azure_resource_group_name
      FROM request_user_resource_groups
      WHERE request_id = $1
    `,
    [requestId]
  );
  const stagingByUserNumber = new Map(
    stagingResult.rows.map((row) => [Number(row.user_number), row.azure_resource_group_name])
  );

  console.log(`Request #${request.id} — Azure Cost Management MTD`);
  console.log(`Project: ${request.project_name || '—'} | ${request.customer_email || '—'}`);
  console.log(`Users: ${usersResult.rows.length}`);
  console.log('Querying subscription ActualCost MonthToDate (grouped by RG)...\n');

  const { spendMap, from, to, rowCount } = await getSubscriptionMtdByRg();
  console.log(`Azure returned ${rowCount} RG cost row(s) for MTD window ~${from} → ${to}\n`);

  let azureTotal = 0;
  let withCost = 0;
  let zeroCost = 0;
  let missingRg = 0;
  const currencyGuess = 'USD';
  const rows = [];

  for (const user of usersResult.rows) {
    const rg =
      user.azure_resource_group_name ||
      stagingByUserNumber.get(Number(user.user_number)) ||
      null;
    if (!rg) {
      missingRg += 1;
      rows.push({
        username: user.username,
        rg: '—',
        azureMtd: null,
        storedMtd: Number(user.stored_mtd || 0),
        error: 'no_resource_group'
      });
      continue;
    }

    const entry = spendMap[String(rg).toLowerCase()];
    const azureMtd = entry ? Number(entry.cost || 0) : 0;
    const currency = entry?.currency || currencyGuess;
    azureTotal += azureMtd;
    if (azureMtd > 0) withCost += 1;
    else zeroCost += 1;

    rows.push({
      username: user.username,
      rg,
      azureMtd,
      currency,
      storedMtd: Number(user.stored_mtd || 0),
      lastSyncedAt: user.last_synced_at,
      syncError: user.sync_error || null
    });
  }

  const withSpend = rows
    .filter((row) => Number(row.azureMtd || 0) > 0)
    .sort((a, b) => Number(b.azureMtd) - Number(a.azureMtd));

  console.log('='.repeat(72));
  console.log(`Users with Azure MTD > 0: ${withSpend.length}`);
  console.log('='.repeat(72));
  if (!withSpend.length) {
    console.log('No MTD cost found in Azure Cost Management for this request\'s RGs.\n');
  } else {
    for (const row of withSpend) {
      console.log(
        `• ${row.username} | ${row.rg} | Azure MTD $${row.azureMtd.toFixed(4)} | stored $${Number(row.storedMtd).toFixed(4)}`
      );
    }
    console.log('');
  }

  console.log('Summary:', {
    requestId,
    users: usersResult.rows.length,
    withAzureMtd: withCost,
    zeroAzureMtd: zeroCost,
    missingRg,
    azureMtdTotal: Number(azureTotal.toFixed(4)),
    note: 'Azure Cost Management can lag several hours; $0 may mean no billed usage yet or delayed data.'
  });
}

main()
  .catch(async (error) => {
    console.error('Failed:', error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await db.end();
    } catch {
      // ignore
    }
  });
