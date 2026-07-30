#!/usr/bin/env node
/**
 * Request #307 — day-wise cost + session time for 24, 27, 28 Jul only.
 * Costs from 25–26 Jul are rolled into 24 Jul (idle/background charges between lab days).
 *
 * Usage:
 *   node scripts/reportRequest307DailyWithTime.js
 *   node scripts/reportRequest307DailyWithTime.js --json
 */
require('dotenv').config();

const axios = require('axios');
const db = require('../src/db/postgres');
const { createAzureCredential, validateAzureEnv } = require('../src/config/azure');
const { sumMergedSessionMinutes } = require('../src/utils/sessionIntervalMerge');

const REQUEST_ID = 307;
const LAB_FROM = '2026-07-23';
const LAB_TO = '2026-07-28';
const USER_COUNT = 11;
const TIMEZONE = 'Asia/Kolkata';
const OUTPUT_JSON = process.argv.includes('--json');
const API_VERSION = '2023-11-01';

const REPORT_DATES = ['2026-07-24', '2026-07-27', '2026-07-28'];
const ROLLUP_DATES = ['2026-07-25', '2026-07-26'];
const ROLLUP_INTO = '2026-07-24';

const RESOURCE_GROUPS = Array.from(
  { length: USER_COUNT },
  (_, index) => `RG-CUST-307-U${index + 1}`
).map((name) => name.toLowerCase());

const SESSION_GAP_MS = Number(process.env.SESSION_MERGE_GAP_MINUTES || 2) * 60 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const formatMoney = (amount, currency) => {
  const symbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : `${currency} `;
  return `${symbol}${Number(amount || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

const formatDuration = (minutes) => {
  const total = Math.round(Number(minutes) || 0);
  if (total <= 0) return '0m';
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
};

const formatDateLabel = (isoDate) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  });
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

function parseDailyByResourceGroup(data) {
  const columns = data?.properties?.columns || [];
  const rows = data?.properties?.rows || [];
  const idx = indexColumns(columns);

  const costIdx = idx.PreTaxCost ?? idx.Cost ?? idx.totalCost ?? 0;
  const dateIdx = idx.UsageDate ?? idx.BillingMonth ?? idx.Date ?? 1;
  const rgIdx = idx.ResourceGroupName ?? idx.ResourceGroup ?? 2;
  const currencyIdx = idx.Currency;

  const matrix = new Map();
  let currency = 'INR';

  for (const row of rows) {
    const rawDate = String(row[dateIdx] ?? '');
    const day =
      rawDate.length >= 8
        ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
        : rawDate;
    const rg = String(row[rgIdx] || '').toUpperCase();
    const cost = Number(row[costIdx] || 0);
    if (currencyIdx != null && row[currencyIdx]) {
      currency = String(row[currencyIdx]);
    }

    const key = `${day}|${rg}`;
    matrix.set(key, (matrix.get(key) || 0) + cost);
  }

  return { currency, matrix };
}

function usernameFromRg(rg) {
  const match = String(rg).match(/U(\d+)$/i);
  return match ? `cust-307-user-${match[1]}` : rg;
}

function rollupCosts(matrix) {
  const byDate = new Map();

  for (const [key, cost] of matrix.entries()) {
    const [date, rg] = key.split('|');
    let targetDate = date;
    if (ROLLUP_DATES.includes(date)) {
      targetDate = ROLLUP_INTO;
    }
    if (!REPORT_DATES.includes(targetDate) && !ROLLUP_DATES.includes(date)) {
      continue;
    }
    if (!REPORT_DATES.includes(targetDate)) {
      continue;
    }

    const cellKey = `${targetDate}|${rg}`;
    byDate.set(cellKey, (byDate.get(cellKey) || 0) + cost);
  }

  return byDate;
}

async function loadUsers() {
  const { rows } = await db.query(
    `
      SELECT id, username
      FROM azure_users
      WHERE request_id = $1
      ORDER BY username ASC
    `,
    [REQUEST_ID]
  );
  return rows;
}

async function computeDayMinutes(userId, date) {
  const { rows } = await db.query(
    `
      SELECT login_at, COALESCE(logout_at, login_at) AS end_at
      FROM user_usage_sessions
      WHERE request_id = $1
        AND user_id = $2
        AND DATE(login_at AT TIME ZONE $3) = $4::date
      ORDER BY login_at ASC
    `,
    [REQUEST_ID, userId, TIMEZONE, date]
  );

  const intervals = rows.map((row) => ({
    start: new Date(row.login_at),
    end: new Date(row.end_at)
  }));

  return sumMergedSessionMinutes(intervals, SESSION_GAP_MS);
}

async function buildSessionReport(users) {
  const byDate = new Map(REPORT_DATES.map((date) => [date, []]));

  for (const date of REPORT_DATES) {
    for (const user of users) {
      const minutes = await computeDayMinutes(user.id, date);
      if (minutes > 0) {
        byDate.get(date).push({
          username: user.username,
          userNumber: Number(String(user.username).match(/user-(\d+)/)?.[1] || 0),
          minutes: Number(minutes.toFixed(1))
        });
      }
    }
    byDate.get(date).sort((a, b) => b.minutes - a.minutes);
  }

  const totals = {};
  for (const date of REPORT_DATES) {
    totals[date] = byDate.get(date).reduce((sum, row) => sum + row.minutes, 0);
  }

  return { byDate, totals };
}

function buildCostReport(matrix, currency) {
  const rolled = rollupCosts(matrix);
  const resourceGroups = [...new Set(
    [...rolled.keys()].map((key) => key.split('|')[1])
  )].sort();

  const days = REPORT_DATES.map((date) => {
    const users = resourceGroups.map((rg) => ({
      resourceGroup: rg,
      username: usernameFromRg(rg),
      cost: Number((rolled.get(`${date}|${rg}`) || 0).toFixed(4))
    }));

    return {
      date,
      users,
      dayTotal: Number(users.reduce((sum, row) => sum + row.cost, 0).toFixed(4))
    };
  });

  const grandTotal = Number(days.reduce((sum, day) => sum + day.dayTotal, 0).toFixed(4));

  return { currency, days, grandTotal };
}

(async () => {
  console.error('Fetching Azure daily costs...');
  const detailData = await queryDailyCosts({ groupByResourceGroup: true });
  const { currency, matrix } = parseDailyByResourceGroup(detailData);

  console.error('Loading session time from database...');
  const users = await loadUsers();
  const sessions = await buildSessionReport(users);
  const costs = buildCostReport(matrix, currency);

  const report = {
    requestId: REQUEST_ID,
    projectName: 'Labs Azure',
    timezone: TIMEZONE,
    dates: REPORT_DATES,
    costRollup: { from: ROLLUP_DATES, into: ROLLUP_INTO },
    currency: costs.currency,
    grandTotal: costs.grandTotal,
    days: REPORT_DATES.map((date) => ({
      date,
      label: formatDateLabel(date),
      costTotal: costs.days.find((day) => day.date === date)?.dayTotal || 0,
      costByUser: costs.days.find((day) => day.date === date)?.users || [],
      timeTotalMinutes: Number((sessions.totals[date] || 0).toFixed(1)),
      timeByUser: sessions.byDate.get(date) || []
    }))
  };

  if (OUTPUT_JSON) {
    console.log(JSON.stringify(report, null, 2));
    await db.end();
    return;
  }

  console.log('');
  console.log('='.repeat(88));
  console.log(`Request #${REQUEST_ID} — Daily Cost & Session Time (24, 27, 28 Jul 2026)`);
  console.log('='.repeat(88));
  console.log(`Source: Azure Cost Management + sign-in session history (${TIMEZONE})`);
  console.log('');

  for (const day of report.days) {
    console.log(`${day.label}`);
    console.log('-'.repeat(88));
    console.log(
      `Total consumption: ${formatMoney(day.costTotal, currency).padStart(12)}   |   Total time: ${formatDuration(day.timeTotalMinutes).padStart(8)} (${Math.round(day.timeTotalMinutes)} min)`
    );
    console.log('');

    if (day.timeByUser.length) {
      console.log('Time by user:');
      console.log(`${'Username'.padEnd(24)} ${'Time'.padStart(10)} ${'Minutes'.padStart(10)}`);
      for (const row of day.timeByUser) {
        console.log(
          `${row.username.padEnd(24)} ${formatDuration(row.minutes).padStart(10)} ${String(Math.round(row.minutes)).padStart(10)}`
        );
      }
    } else {
      console.log('Time by user: no recorded sessions on this date');
    }

    console.log('');
    console.log('Cost by user:');
    const activeCosts = day.costByUser.filter((row) => row.cost > 0);
    if (activeCosts.length) {
      console.log(`${'Username'.padEnd(24)} ${'Consumption'.padStart(14)}`);
      for (const row of activeCosts.sort((a, b) => b.cost - a.cost)) {
        console.log(`${row.username.padEnd(24)} ${formatMoney(row.cost, currency).padStart(14)}`);
      }
    } else {
      console.log('  (none)');
    }
    console.log('');
  }

  console.log('-'.repeat(88));
  console.log(
    `${'GRAND TOTAL'.padEnd(20)} ${formatMoney(report.grandTotal, currency).padStart(14)}   |   ${formatDuration(
      REPORT_DATES.reduce((sum, date) => sum + (sessions.totals[date] || 0), 0)
    ).padStart(8)} total`
  );
  console.log('='.repeat(88));

  await db.end();
})().catch(async (error) => {
  const message = error?.response?.data?.error?.message || error.message || error;
  console.error('Report failed:', message);
  try {
    await db.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
