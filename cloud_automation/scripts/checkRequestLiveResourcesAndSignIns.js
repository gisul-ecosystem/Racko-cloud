/**
 * Check request users for:
 *  1) Live Azure resources in their resource groups
 *  2) Real Entra / Graph sign-ins today
 *
 * Usage:
 *   node scripts/checkRequestLiveResourcesAndSignIns.js --request-id 365
 *   DATABASE_URL=postgresql://... node scripts/checkRequestLiveResourcesAndSignIns.js --request-id 365
 */
require('dotenv').config();

const { Client } = require('pg');
const { Client: GraphClient } = require('@microsoft/microsoft-graph-client');
const { ResourceManagementClient } = require('@azure/arm-resources');
const { createAzureCredential, validateAzureEnv } = require('../src/config/azure');
const { runWithConcurrency } = require('../src/utils/concurrency');

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

const startOfTodayUtc = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
};

const createDbClient = () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }
  return new Client({
    connectionString: process.env.DATABASE_URL.replace(/:6543\//, ':5432/'),
    ssl: process.env.SUPABASE_DB_SSL === 'false' ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000
  });
};

const createGraphClient = () => {
  const azureConfig = validateAzureEnv();
  const credential = createAzureCredential(azureConfig);
  return GraphClient.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => {
        const token = await credential.getToken('https://graph.microsoft.com/.default');
        return token.token;
      }
    }
  });
};

const createArmClient = () => {
  const azureConfig = validateAzureEnv();
  const credential = createAzureCredential(azureConfig);
  return new ResourceManagementClient(credential, azureConfig.subscriptionId);
};

const listLiveResources = async (armClient, resourceGroupName) => {
  const resources = [];
  try {
    for await (const resource of armClient.resources.listByResourceGroup(resourceGroupName)) {
      resources.push({
        name: resource.name,
        type: resource.type,
        location: resource.location || null,
        id: resource.id
      });
    }
    return { ok: true, resources, error: null };
  } catch (error) {
    const status = Number(error?.statusCode || error?.status);
    if (status === 404) {
      return { ok: true, resources: [], error: 'resource_group_not_found' };
    }
    return {
      ok: false,
      resources: [],
      error: error?.message || String(error)
    };
  }
};

const fetchSignInsToday = async (graphClient, upn, sinceIso) => {
  const filter = `userPrincipalName eq '${String(upn).replace(/'/g, "''")}' and createdDateTime ge ${sinceIso}`;
  try {
    const page = await graphClient
      .api('/auditLogs/signIns')
      .filter(filter)
      .top(50)
      .orderby('createdDateTime desc')
      .get();
    return {
      ok: true,
      signIns: (page.value || []).map((row) => ({
        createdDateTime: row.createdDateTime,
        app: row.appDisplayName || null,
        resource: row.resourceDisplayName || null,
        status: row.status?.errorCode === 0 ? 'success' : 'failed',
        ip: row.ipAddress || null
      })),
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      signIns: [],
      error: error?.message || String(error)
    };
  }
};

const fetchSignInActivity = async (graphClient, azureUserId) => {
  try {
    const user = await graphClient
      .api(`/users/${azureUserId}`)
      .select('id,userPrincipalName,accountEnabled,signInActivity')
      .get();
    const activity = user.signInActivity || {};
    return {
      ok: true,
      upn: user.userPrincipalName || null,
      accountEnabled: user.accountEnabled !== false,
      lastSuccessfulSignIn:
        activity.lastSuccessfulSignInDateTime ||
        activity.lastSignInDateTime ||
        null,
      lastNonInteractiveSignIn: activity.lastNonInteractiveSignInDateTime || null,
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      upn: null,
      accountEnabled: null,
      lastSuccessfulSignIn: null,
      lastNonInteractiveSignIn: null,
      error: error?.message || String(error)
    };
  }
};

const main = async () => {
  const { requestId } = parseArgs();
  const since = startOfTodayUtc();
  const sinceIso = since.toISOString();

  const db = createDbClient();
  await db.connect();

  try {
    const requestResult = await db.query(
      `
        SELECT id, project_name, customer_email, location, status, costing_mode, account_count,
               azure_resource_group_name
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
          au.azure_user_id,
          au.azure_resource_group_name,
          au.status,
          au.azure_account_enabled,
          au.last_signin_at
        FROM azure_users au
        WHERE au.request_id = $1
          AND COALESCE(au.is_deleted, false) = false
        ORDER BY au.user_number ASC NULLS LAST, au.username ASC
      `,
      [requestId]
    );

    const stagingResult = await db.query(
      `
        SELECT user_number, azure_resource_group_name, azure_resource_group_id
        FROM request_user_resource_groups
        WHERE request_id = $1
        ORDER BY user_number ASC
      `,
      [requestId]
    );
    const stagingByUserNumber = new Map(
      stagingResult.rows.map((row) => [Number(row.user_number), row.azure_resource_group_name])
    );

    console.log('='.repeat(72));
    console.log(`Request #${request.id} — live Azure resources + today's sign-ins`);
    console.log(`Project: ${request.project_name || '—'} | ${request.customer_email || '—'}`);
    console.log(
      `Status: ${request.status} | Mode: ${request.costing_mode} | Accounts: ${request.account_count}`
    );
    console.log(`Users in DB: ${usersResult.rows.length}`);
    console.log(`Today (UTC) from: ${sinceIso}`);
    console.log('='.repeat(72));

    const armClient = createArmClient();
    const graphClient = createGraphClient();

    const rows = [];
    await runWithConcurrency(
      usersResult.rows,
      8,
      async (user) => {
        const rgName =
          user.azure_resource_group_name ||
          stagingByUserNumber.get(Number(user.user_number)) ||
          (request.azure_resource_group_name
            ? String(request.azure_resource_group_name)
            : null);

        const [live, activity] = await Promise.all([
          rgName
            ? listLiveResources(armClient, rgName)
            : Promise.resolve({ ok: true, resources: [], error: 'no_resource_group' }),
          user.azure_user_id
            ? fetchSignInActivity(graphClient, user.azure_user_id)
            : Promise.resolve({
                ok: false,
                upn: null,
                accountEnabled: null,
                lastSuccessfulSignIn: null,
                lastNonInteractiveSignIn: null,
                error: 'missing_azure_user_id'
              })
        ]);

        const upn = activity.upn || `${user.username}`;
        const signInsToday = activity.upn
          ? await fetchSignInsToday(graphClient, activity.upn, sinceIso)
          : { ok: false, signIns: [], error: 'no_upn' };

        const lastSignIn = activity.lastSuccessfulSignIn
          ? new Date(activity.lastSuccessfulSignIn)
          : null;
        const signedInTodayByActivity = Boolean(lastSignIn && lastSignIn >= since);
        const signedInTodayByAudit = (signInsToday.signIns || []).some(
          (s) => s.status === 'success'
        );

        rows.push({
          userNumber: user.user_number,
          username: user.username,
          azureUserId: user.azure_user_id,
          upn: activity.upn,
          accountEnabled: activity.accountEnabled,
          resourceGroup: rgName,
          liveResourceCount: live.resources.length,
          liveResources: live.resources.slice(0, 8).map((r) => `${r.type}/${r.name}`),
          liveError: live.error,
          signedInToday: signedInTodayByAudit || signedInTodayByActivity,
          signInCountToday: (signInsToday.signIns || []).length,
          lastSuccessfulSignIn: activity.lastSuccessfulSignIn,
          todaySignIns: (signInsToday.signIns || []).slice(0, 3),
          signInError: signInsToday.error || activity.error || null
        });
      },
      { continueOnError: true }
    );

    rows.sort((a, b) => Number(a.userNumber || 0) - Number(b.userNumber || 0));

    const withLive = rows.filter((r) => r.liveResourceCount > 0);
    const signedInToday = rows.filter((r) => r.signedInToday);
    const rgMissing = rows.filter((r) => r.liveError === 'resource_group_not_found');

    console.log('\n--- Per user ---');
    for (const row of rows) {
      console.log(
        [
          `#${row.userNumber ?? '?'} ${row.username}`,
          `RG=${row.resourceGroup || '—'}`,
          `live=${row.liveResourceCount}`,
          `signedInToday=${row.signedInToday ? 'YES' : 'no'}`,
          `lastSignIn=${row.lastSuccessfulSignIn || '—'}`,
          row.liveError ? `liveErr=${row.liveError}` : null,
          row.signInError ? `signInErr=${row.signInError}` : null
        ]
          .filter(Boolean)
          .join(' | ')
      );
      if (row.liveResources.length) {
        console.log(`    resources: ${row.liveResources.join(', ')}`);
      }
      if (row.todaySignIns.length) {
        for (const s of row.todaySignIns) {
          console.log(
            `    today sign-in: ${s.createdDateTime} app=${s.app || '—'} status=${s.status}`
          );
        }
      }
    }

    console.log('\n--- Summary ---');
    console.log(`Users checked: ${rows.length}`);
    console.log(`Users with live Azure resources: ${withLive.length}`);
    console.log(`Users who signed in today (UTC): ${signedInToday.length}`);
    console.log(`Resource groups missing in Azure: ${rgMissing.length}`);

    if (withLive.length) {
      console.log('\nLive resource holders:');
      for (const row of withLive) {
        console.log(
          `  ${row.username} (${row.resourceGroup}): ${row.liveResourceCount} resource(s)`
        );
      }
    }

    if (signedInToday.length) {
      console.log('\nSigned in today:');
      for (const row of signedInToday) {
        console.log(
          `  ${row.username} last=${row.lastSuccessfulSignIn} auditCount=${row.signInCountToday}`
        );
      }
    } else {
      console.log('\nNo users from this request have a successful Azure sign-in recorded today (UTC).');
    }
  } finally {
    await db.end();
  }
};

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
