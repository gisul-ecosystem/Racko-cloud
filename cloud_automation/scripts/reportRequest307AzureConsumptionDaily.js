#!/usr/bin/env node
/**
 * Day-wise Azure consumption report for request #307.
 *
 * Usage:
 *   node scripts/reportRequest307AzureConsumptionDaily.js
 *   node scripts/reportRequest307AzureConsumptionDaily.js --json
 */
require('dotenv').config();

const axios = require('axios');
const { createAzureCredential, validateAzureEnv } = require('../src/config/azure');

const REQUEST_ID = 307;
const LAB_FROM = '2026-07-23';
const LAB_TO = '2026-07-28';
const USER_COUNT = 11;
const OUTPUT_JSON = process.argv.includes('--json');
const API_VERSION = '2023-11-01';

const RESOURCE_GROUPS = Array.from(
  { length: USER_COUNT },
  (_, index) => `RG-CUST-307-U${index + 1}`
).map((name) => name.toLowerCase());

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const formatMoney = (amount, currency) => {
  const symbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : `${currency} `;
  return `${symbol}${Number(amount || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

async function queryDailyCosts({ groupByResourceGroup = false }) {
  const azureConfig = validateAzureEnv();
  const credential = createAzureCredential(azureConfig);
  const token = await credential.getToken('https://management.azure.com/.default');
  const subscriptionId = azureConfig.subscriptionId;

  const url = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.CostManagement/query?api-version=${API_VERSION}`;

  const dataset = {
    granularity: 'Daily',
    aggregation: {
      totalCost: {
        name: 'PreTaxCost',
        function: 'Sum'
      }
    },
    filter: {
      dimensions: {
        name: 'ResourceGroupName',
        operator: 'In',
        values: RESOURCE_GROUPS
      }
    }
  };

  if (groupByResourceGroup) {
    dataset.grouping = [{ type: 'Dimension', name: 'ResourceGroupName' }];
  }

  const body = {
    type: 'ActualCost',
    timeframe: 'Custom',
    timePeriod: {
      from: `${LAB_FROM}T00:00:00Z`,
      to: `${LAB_TO}T23:59:59Z`
    },
    dataset
  };

  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await axios.post(url, body, {
        headers: {
          Authorization: `Bearer ${token.token}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      });
      return response.data;
    } catch (error) {
      lastError = error;
      if (/too many requests/i.test(error.message || '') && attempt < 4) {
        await sleep(5000 * attempt);
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}

function indexColumns(columns) {
  const map = {};
  columns.forEach((column, index) => {
    map[String(column.name)] = index;
  });
  return map;
}

function parseDailyTotals(data) {
  const columns = data?.properties?.columns || [];
  const rows = data?.properties?.rows || [];
  const idx = indexColumns(columns);

  const costIdx = idx.PreTaxCost ?? idx.Cost ?? idx.totalCost ?? 0;
  const dateIdx = idx.UsageDate ?? idx.BillingMonth ?? idx.Date ?? 1;
  const currencyIdx = idx.Currency;

  const byDay = new Map();
  let currency = 'INR';

  for (const row of rows) {
    const rawDate = String(row[dateIdx] ?? '');
    const day = rawDate.length >= 8 ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}` : rawDate;
    const cost = Number(row[costIdx] || 0);
    if (currencyIdx != null && row[currencyIdx]) {
      currency = String(row[currencyIdx]);
    }
    byDay.set(day, (byDay.get(day) || 0) + cost);
  }

  return {
    currency,
    days: [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, cost]) => ({ date, cost: Number(cost.toFixed(4)) }))
  };
}

function parseDailyByResourceGroup(data) {
  const columns = data?.properties?.columns || [];
  const rows = data?.properties?.rows || [];
  const idx = indexColumns(columns);

  const costIdx = idx.PreTaxCost ?? idx.Cost ?? idx.totalCost ?? 0;
  const dateIdx = idx.UsageDate ?? idx.BillingMonth ?? idx.Date ?? 1;
  const rgIdx = idx.ResourceGroupName ?? idx.ResourceGroup ?? 2;
  const currencyIdx = idx.Currency;

  const matrix = new Map();
  const days = new Set();
  const groups = new Set();
  let currency = 'INR';

  for (const row of rows) {
    const rawDate = String(row[dateIdx] ?? '');
    const day = rawDate.length >= 8 ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}` : rawDate;
    const rg = String(row[rgIdx] || '').toUpperCase();
    const cost = Number(row[costIdx] || 0);
    if (currencyIdx != null && row[currencyIdx]) {
      currency = String(row[currencyIdx]);
    }

    days.add(day);
    groups.add(rg);
    const key = `${day}|${rg}`;
    matrix.set(key, (matrix.get(key) || 0) + cost);
  }

  const sortedDays = [...days].sort();
  const sortedGroups = [...groups].sort();

  return {
    currency,
    days: sortedDays,
    resourceGroups: sortedGroups,
    cells: sortedDays.map((date) => ({
      date,
      byResourceGroup: sortedGroups.map((rg) => ({
        resourceGroup: rg,
        user: rg.match(/U(\d+)$/i) ? `cust-307-user-${RegExp.$1}` : rg,
        cost: Number((matrix.get(`${date}|${rg}`) || 0).toFixed(4))
      })),
      dayTotal: Number(
        sortedGroups
          .reduce((sum, rg) => sum + (matrix.get(`${date}|${rg}`) || 0), 0)
          .toFixed(4)
      )
    }))
  };
}

(async () => {
  console.error('Fetching daily totals from Azure Cost Management...');
  const totalsData = await queryDailyCosts({ groupByResourceGroup: false });

  console.error('Fetching daily breakdown by resource group...');
  await sleep(3000);
  const detailData = await queryDailyCosts({ groupByResourceGroup: true });

  const dailyTotals = parseDailyTotals(totalsData);
  const dailyDetail = parseDailyByResourceGroup(detailData);
  const grandTotal = dailyTotals.days.reduce((sum, row) => sum + row.cost, 0);

  const report = {
    requestId: REQUEST_ID,
    projectName: 'Labs Azure',
    period: { from: LAB_FROM, to: LAB_TO },
    source: 'Azure Cost Management (ActualCost, Daily granularity)',
    currency: dailyTotals.currency || dailyDetail.currency,
    grandTotal: Number(grandTotal.toFixed(4)),
    dailyTotals: dailyTotals.days,
    dailyByUser: dailyDetail.cells
  };

  if (OUTPUT_JSON) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const currency = report.currency;

  console.log('');
  console.log('='.repeat(80));
  console.log(`Day-wise Azure Consumption — Request #${REQUEST_ID} (Labs Azure)`);
  console.log('='.repeat(80));
  console.log(`Period: ${LAB_FROM} to ${LAB_TO}`);
  console.log(`Source: Azure Cost Management (daily actual cost)`);
  console.log('');

  console.log('Daily totals (all 11 resource groups):');
  console.log('-'.repeat(40));
  console.log(`${'Date'.padEnd(14)} ${'Consumption'.padStart(16)}`);
  console.log('-'.repeat(40));
  for (const row of dailyTotals.days) {
    console.log(`${row.date.padEnd(14)} ${formatMoney(row.cost, currency).padStart(16)}`);
  }
  console.log('-'.repeat(40));
  console.log(`${'TOTAL'.padEnd(14)} ${formatMoney(grandTotal, currency).padStart(16)}`);
  console.log('');

  console.log('Daily breakdown by user / resource group:');
  console.log('-'.repeat(80));
  const header = ['Date', ...dailyDetail.resourceGroups.map((rg) => rg.replace('RG-CUST-307-U', 'U'))];
  console.log(header.map((h, i) => (i === 0 ? h.padEnd(12) : h.padStart(8))).join(' '));
  console.log('-'.repeat(80));

  for (const dayRow of dailyDetail.cells) {
    const cols = [
      dayRow.date,
      ...dayRow.byResourceGroup.map((cell) => formatMoney(cell.cost, currency).replace(/[₹$]/, ''))
    ];
    console.log(cols.map((c, i) => (i === 0 ? String(c).padEnd(12) : String(c).padStart(8))).join(' '));
    console.log(`${''.padEnd(12)} ${'Day total:'.padStart(8)} ${formatMoney(dayRow.dayTotal, currency)}`);
  }

  console.log('');
  console.log('Note: Today (28 Jul) may still be partial — Azure billing lags several hours.');
  console.log('='.repeat(80));
})().catch((error) => {
  const message = error?.response?.data?.error?.message || error.message || error;
  console.error('Report failed:', message);
  process.exit(1);
});
