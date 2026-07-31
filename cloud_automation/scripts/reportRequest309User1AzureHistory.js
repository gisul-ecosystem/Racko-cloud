#!/usr/bin/env node
require('dotenv').config();
const axios = require('axios');
const db = require('../src/db/postgres');
const { createAzureCredential, validateAzureEnv } = require('../src/config/azure');
const { queryCostForResourceGroup } = require('../src/services/azureCostManagementService');
const { createGraphClient, getVerifiedDomain } = require('../src/provisioners/azure/userProvisioner');
const { sumMergedSessionMinutes } = require('../src/utils/sessionIntervalMerge');

const USERNAME = 'cust-309-user-1';
const RESOURCE_GROUP = 'RG-CUST-309-U1';
const AZURE_USER_ID = '378addaa-a03f-4cad-8da3-553c2fe02b94';
const REQUEST_ID = 309;
const TIMEZONE = 'Asia/Kolkata';
const API_VERSION = '2023-11-01';
const SESSION_GAP_MS = 2 * 60 * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const formatMoney = (amount, currency) => {
  const symbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : `${currency} `;
  return `${symbol}${Number(amount || 0).toFixed(2)}`;
};

const formatDuration = (minutes) => {
  const total = Math.round(Number(minutes) || 0);
  if (total <= 0) return '0m';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
};

const formatDateLabel = (iso) => {
  const [y, mo, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
  });
};

async function queryDailyCosts(from, to) {
  const azureConfig = validateAzureEnv();
  const credential = createAzureCredential(azureConfig);
  const token = await credential.getToken('https://management.azure.com/.default');
  const url = `https://management.azure.com/subscriptions/${azureConfig.subscriptionId}/providers/Microsoft.CostManagement/query?api-version=${API_VERSION}`;

  const body = {
    type: 'ActualCost',
    timeframe: 'Custom',
    timePeriod: { from: `${from}T00:00:00Z`, to: `${to}T23:59:59Z` },
    dataset: {
      granularity: 'Daily',
      aggregation: { totalCost: { name: 'PreTaxCost', function: 'Sum' } },
      filter: {
        dimensions: {
          name: 'ResourceGroupName',
          operator: 'In',
          values: [RESOURCE_GROUP.toLowerCase()]
        }
      }
    }
  };

  const response = await axios.post(url, body, {
    headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' },
    timeout: 60000
  });

  const columns = response.data?.properties?.columns || [];
  const rows = response.data?.properties?.rows || [];
  const costIdx = columns.findIndex((c) => ['PreTaxCost', 'Cost'].includes(c.name));
  const dateIdx = columns.findIndex((c) => ['UsageDate', 'Date'].includes(c.name));
  const currencyIdx = columns.findIndex((c) => c.name === 'Currency');

  return rows.map((row) => {
    const raw = String(row[dateIdx] ?? '');
    const date = raw.length >= 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw;
    return {
      date,
      cost: Number(row[costIdx] || 0),
      currency: currencyIdx >= 0 ? row[currencyIdx] : 'INR'
    };
  }).filter((r) => r.cost > 0).sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchSignIns(graphClient, { upn, azureUserId, sinceIso }) {
  const rows = [];
  const filters = [];
  if (azureUserId) filters.push(`userId eq '${azureUserId}'`);
  if (upn) filters.push(`userPrincipalName eq '${upn}'`);

  for (const filterExpr of filters) {
    let url = `/auditLogs/signIns?$filter=${filterExpr} and createdDateTime ge ${sinceIso}&$top=100&$orderby=createdDateTime asc`;

    while (url) {
      const response = await graphClient.api(url).get();
      rows.push(...(response.value || []));
      url = response['@odata.nextLink']
        ? response['@odata.nextLink'].replace('https://graph.microsoft.com/v1.0', '')
        : null;
      if (url) await sleep(200);
    }

    if (rows.length) break;
  }

  const deduped = [...new Map(rows.map((row) => [row.id, row])).values()];
  return deduped.sort(
    (a, b) => new Date(a.createdDateTime).getTime() - new Date(b.createdDateTime).getTime()
  );
}

function buildSessions(signIns) {
  if (!signIns.length) return [];
  const sessions = [];
  let current = null;

  for (const signIn of signIns) {
    const loginAt = new Date(signIn.createdDateTime);
    if (!current) {
      current = { loginAt, lastSeen: loginAt };
      continue;
    }
    const gapMinutes = (loginAt.getTime() - current.lastSeen.getTime()) / 60000;
    if (gapMinutes <= 90) {
      current.lastSeen = loginAt;
    } else {
      sessions.push(current);
      current = { loginAt, lastSeen: loginAt };
    }
  }
  if (current) sessions.push(current);

  return sessions.map((s) => {
    const logoutAt = new Date(s.lastSeen.getTime() + 15 * 60 * 1000);
    const minutes = Math.max(1, Math.round((logoutAt.getTime() - s.loginAt.getTime()) / 60000));
    return { loginAt: s.loginAt, logoutAt, minutes };
  });
}

function sessionsByDay(sessions, timezone) {
  const byDay = new Map();

  for (const session of sessions) {
    const loginDate = session.loginAt.toLocaleDateString('en-CA', { timeZone: timezone });
    if (!byDay.has(loginDate)) byDay.set(loginDate, []);
    byDay.get(loginDate).push({ start: session.loginAt, end: session.logoutAt, minutes: session.minutes });
  }

  const result = [];
  for (const [date, intervals] of [...byDay.entries()].sort()) {
    const mergedMinutes = sumMergedSessionMinutes(
      intervals.map((i) => ({ start: i.start, end: i.end })),
      SESSION_GAP_MS
    );
    result.push({ date, minutes: Math.round(mergedMinutes), sessions: intervals.length });
  }
  return result;
}

(async () => {
  const req = await db.query(
    `SELECT id, project_name, customer_email, created_at, starts_at, expiry_date, status
     FROM requests WHERE id = $1`,
    [REQUEST_ID]
  );
  const user = await db.query(
    `SELECT id, username, azure_user_id, azure_resource_group_name, created_at, status,
            COALESCE(is_deleted, false) AS is_deleted
     FROM azure_users WHERE request_id = $1 AND lower(username) = lower($2) LIMIT 1`,
    [REQUEST_ID, USERNAME]
  );

  const request = req.rows[0];
  const userRow = user.rows[0];
  const labStart = (request?.starts_at || request?.created_at || userRow?.created_at);
  const fromDate = new Date(labStart).toISOString().slice(0, 10);
  const toDate = new Date().toISOString().slice(0, 10);

  console.log('='.repeat(80));
  console.log(`Real Azure History — ${USERNAME}`);
  console.log('='.repeat(80));
  console.log(`Request: #${REQUEST_ID} ${request?.project_name || ''}`);
  console.log(`Resource group: ${RESOURCE_GROUP}`);
  console.log(`Azure user ID: ${userRow?.azure_user_id || AZURE_USER_ID}`);
  console.log(`Lab period queried: ${fromDate} to ${toDate}`);
  console.log(`DB status: ${userRow?.status || 'unknown'}${userRow?.is_deleted ? ' (marked deleted in DB)' : ''}`);
  console.log('');

  console.error('Fetching Azure Cost Management...');
  const total = await queryCostForResourceGroup({
    resourceGroupName: RESOURCE_GROUP,
    from: fromDate,
    to: toDate
  });
  const dailyCosts = await queryDailyCosts(fromDate, toDate);

  console.log('--- CONSUMPTION (Azure Cost Management) ---');
  console.log(`Total: ${formatMoney(total.cost, total.currency)}`);
  console.log('');
  console.log(`${'Date'.padEnd(16)} ${'Cost'.padStart(12)}`);
  console.log('-'.repeat(30));
  for (const row of dailyCosts) {
    console.log(`${formatDateLabel(row.date).padEnd(16)} ${formatMoney(row.cost, row.currency || total.currency).padStart(12)}`);
  }
  if (!dailyCosts.length) console.log('(no billed usage in period)');
  console.log('');

  console.error('Fetching Microsoft Graph sign-in logs...');
  const { graphClient } = createGraphClient();
  const domain = await getVerifiedDomain(graphClient);
  const upn = `${USERNAME}@${domain}`;
  const sinceIso = new Date(labStart).toISOString();

  let signIns = [];
  let entraUser = null;
  try {
    entraUser = await graphClient
      .api(`/users/${userRow?.azure_user_id || AZURE_USER_ID}`)
      .select('id,userPrincipalName,accountEnabled,createdDateTime')
      .get();
  } catch {
    entraUser = null;
  }

  try {
    signIns = await fetchSignIns(graphClient, {
      upn,
      azureUserId: userRow?.azure_user_id || AZURE_USER_ID,
      sinceIso
    });
  } catch (error) {
    console.warn(`Sign-in fetch failed: ${error.message}`);
  }

  const successfulSignIns = signIns.filter(
    (e) => e.status?.errorCode === 0 || e.status?.errorCode === 50140
  );
  const sessions = buildSessions(successfulSignIns);
  const daySessions = sessionsByDay(sessions, TIMEZONE);
  const totalMinutes = daySessions.reduce((s, d) => s + d.minutes, 0);

  console.log('--- SESSION TIME (Microsoft Graph sign-in logs) ---');
  console.log(`UPN: ${upn}`);
  console.log(`Sign-in events: ${signIns.length} (${successfulSignIns.length} successful)  |  Sessions (merged): ${sessions.length}  |  Total time: ${formatDuration(totalMinutes)} (${totalMinutes} min)`);
  console.log('');
  console.log(`${'Date'.padEnd(16)} ${'Time'.padStart(10)} ${'Minutes'.padStart(10)} ${'Sessions'.padStart(10)}`);
  console.log('-'.repeat(50));
  for (const row of daySessions) {
    console.log(`${formatDateLabel(row.date).padEnd(16)} ${formatDuration(row.minutes).padStart(10)} ${String(row.minutes).padStart(10)} ${String(row.sessions).padStart(10)}`);
  }
  if (!daySessions.length) console.log('(no sign-in activity in period)');

  console.log('');
  console.log('--- COMBINED DAY VIEW ---');
  const allDates = [...new Set([...dailyCosts.map((d) => d.date), ...daySessions.map((d) => d.date)])].sort();
  console.log(`${'Date'.padEnd(16)} ${'Cost'.padStart(12)} ${'Time'.padStart(10)} ${'Minutes'.padStart(10)}`);
  console.log('-'.repeat(52));
  for (const date of allDates) {
    const cost = dailyCosts.find((d) => d.date === date);
    const time = daySessions.find((d) => d.date === date);
    console.log(
      `${formatDateLabel(date).padEnd(16)} ${formatMoney(cost?.cost || 0, total.currency).padStart(12)} ${formatDuration(time?.minutes || 0).padStart(10)} ${String(time?.minutes || 0).padStart(10)}`
    );
  }

  console.log('');
  console.log('--- ALL SIGN-IN ATTEMPTS (Azure audit log) ---');
  for (const entry of signIns) {
    const at = new Date(entry.createdDateTime).toLocaleString('en-IN', { timeZone: TIMEZONE });
    const code = entry.status?.errorCode ?? '?';
    const detail = entry.status?.failureReason || entry.status?.additionalDetails || 'success';
    console.log(`  ${at}  code=${code}  ${entry.appDisplayName || 'Azure'}  ${detail}`);
  }
  if (!signIns.length) console.log('  (none)');

  console.log('');
  console.log('--- RECENT SUCCESSFUL SIGN-INS ---');
  for (const entry of successfulSignIns.slice(-10).reverse()) {
    const at = new Date(entry.createdDateTime).toLocaleString('en-IN', { timeZone: TIMEZONE });
    console.log(`  ${at}  ${entry.appDisplayName || entry.resourceDisplayName || 'Azure'}`);
  }

  console.log('='.repeat(80));
  await db.end();
})().catch(async (e) => {
  console.error('Failed:', e?.response?.data?.error?.message || e.message);
  try { await db.end(); } catch { /* ignore */ }
  process.exit(1);
});
