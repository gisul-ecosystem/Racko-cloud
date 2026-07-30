#!/usr/bin/env node
/**
 * Delete + re-provision a single lab user in Azure and DB (clears MFA enrollment).
 *
 * Usage:
 *   node scripts/reprovisionSingleLabUser.js --username cust-307-user-1 --request-id 307
 *   node scripts/reprovisionSingleLabUser.js --username cust-307-user-1 --request-id 307 --apply
 */
require('dotenv').config();

const db = require('../src/db/postgres');
const { deletePortalUserByOrgAdmin } = require('../src/services/managePortalService');
const { provisionResourceGroup } = require('../src/provisioners/azure/resourceGroupProvisioner');
const {
  createGraphClient,
  createOrAdoptGraphUser,
  getVerifiedDomain
} = require('../src/provisioners/azure/userProvisioner');
const {
  buildResourceGroupScope,
  createAuthorizationClient,
  createRoleAssignmentWithRetry,
  findMatchingRoleDefinition,
  getExistingAzureAssignment,
  roleAssignmentIdFromSeed
} = require('../src/provisioners/azure/roleProvisioner');
const { reprovisionRolesForRequest } = require('../src/services/roleProvisionService');
const { resolveUsageLocation } = require('../src/utils/azureUsageLocation');

const APPLY = process.argv.includes('--apply');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const USER_SPECS = {
  'cust-307-user-1': {
    requestId: 307,
    userNumber: 1,
    password: '5-Ai2F$=d8_9HSFe',
    resourceGroupName: 'RG-CUST-307-U1',
    location: 'southcentralus'
  }
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { username: 'cust-307-user-1', requestId: 307 };

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--username' && args[i + 1]) {
      options.username = args[++i];
    } else if (args[i] === '--request-id' && args[i + 1]) {
      options.requestId = Number(args[++i]);
    }
  }

  return options;
}

async function permanentlyDeleteEntraUser(graphClient, azureUserId) {
  if (!azureUserId) return;

  try {
    await graphClient.api(`/directory/deletedItems/${encodeURIComponent(azureUserId)}`).delete();
    console.log(`  ✓ Permanently purged Entra user ${azureUserId}`);
  } catch (error) {
    const status = Number(error?.statusCode || error?.status);
    if (status === 404) {
      console.log(`  ~ Entra user ${azureUserId} not in deleted items (already purged or missing)`);
      return;
    }
    throw error;
  }
}

async function purgeDeletedUserByUpn(graphClient, upn) {
  let url = `/directory/deletedItems/microsoft.graph.user?$filter=userPrincipalName eq '${upn}'&$select=id,userPrincipalName,deletedDateTime`;

  while (url) {
    const response = await graphClient.api(url).get();
    const items = response.value || [];

    for (const item of items) {
      await graphClient.api(`/directory/deletedItems/${encodeURIComponent(item.id)}`).delete();
      console.log(`  ✓ Permanently purged deleted UPN ${item.userPrincipalName} (${item.id})`);
    }

    url = response['@odata.nextLink']
      ? response['@odata.nextLink'].replace('https://graph.microsoft.com/v1.0', '')
      : null;
  }
}

async function assignContributor({ requestId, dbUserId, azureUserId, resourceGroupName }) {
  const { authorizationClient, subscriptionId } = createAuthorizationClient();
  const scope = buildResourceGroupScope(subscriptionId, resourceGroupName);
  const roleDefinition = await findMatchingRoleDefinition(authorizationClient, scope, 'Contributor');
  const assignmentSeed = [requestId, dbUserId, roleDefinition.id, scope].join(':');
  const assignmentId = roleAssignmentIdFromSeed(assignmentSeed);
  const existingAzureAssignment = await getExistingAzureAssignment(
    authorizationClient,
    scope,
    assignmentId
  );

  if (!existingAzureAssignment) {
    await createRoleAssignmentWithRetry(
      authorizationClient,
      scope,
      assignmentId,
      {
        principalId: azureUserId,
        roleDefinitionId: roleDefinition.id,
        principalType: 'User'
      },
      requestId
    );
  }

  await db.query(
    `
      INSERT INTO user_role_assignments (
        assignment_id, request_id, user_id, azure_role, scope,
        assignment_status, assigned_at, assignment_kind, created_at
      )
      VALUES ($1, $2, $3, 'Contributor', $4, 'assigned', NOW(), 'rbac', NOW())
      ON CONFLICT (request_id, user_id, azure_role) DO NOTHING
    `,
    [assignmentId, requestId, dbUserId, scope]
  );
}

async function insertDbUser({
  requestId,
  userNumber,
  username,
  password,
  azureUserId,
  resourceGroupName,
  resourceGroupId
}) {
  const inserted = await db.query(
    `
      INSERT INTO azure_users (
        request_id,
        azure_user_id,
        username,
        temporary_password,
        status,
        user_number,
        azure_resource_group_name,
        azure_resource_group_id,
        azure_account_enabled,
        is_deleted
      )
      VALUES ($1, $2, $3, $4, 'Created', $5, $6, $7, TRUE, FALSE)
      RETURNING id
    `,
    [requestId, azureUserId, username, password, userNumber, resourceGroupName, resourceGroupId]
  );

  await db.query(
    `
      INSERT INTO request_user_resource_groups (request_id, user_number, azure_resource_group_name)
      VALUES ($1, $2, $3)
      ON CONFLICT (request_id, user_number) DO UPDATE
      SET azure_resource_group_name = EXCLUDED.azure_resource_group_name
    `,
    [requestId, userNumber, resourceGroupName]
  );

  return inserted.rows[0].id;
}

async function reprovisionUser(spec, username) {
  const existing = await db.query(
    `
      SELECT id, username, azure_user_id, azure_resource_group_name
      FROM azure_users
      WHERE request_id = $1
        AND lower(username) = lower($2)
        AND COALESCE(is_deleted, false) = false
      LIMIT 1
    `,
    [spec.requestId, username]
  );

  const request = await db.query(`SELECT customer_email FROM requests WHERE id = $1`, [spec.requestId]);
  const adminEmail = request.rows[0]?.customer_email || 'dev-portal@racko.ai';
  const oldUser = existing.rows[0] || null;

  console.log(`User: ${username}`);
  if (oldUser) {
    console.log(`DB id: ${oldUser.id}`);
    console.log(`Current Entra id: ${oldUser.azure_user_id}`);
  } else {
    console.log('DB row: not found (will create fresh)');
  }
  console.log(`Resource group: ${spec.resourceGroupName}`);

  if (!APPLY) {
    console.log('\nDry run — would delete Azure+DB user, purge Entra recycle bin, recreate fresh.');
    console.log('Re-run with --apply');
    return;
  }

  const { graphClient } = createGraphClient();
  const domain = await getVerifiedDomain(graphClient);
  const upn = `${username}@${domain}`;

  if (oldUser) {
    console.log('\nStep 1: Delete user from Azure + DB...');
    await deletePortalUserByOrgAdmin({
      adminEmail,
      requestId: spec.requestId,
      userId: oldUser.id
    });
    console.log('  ✓ Deleted from Azure and DB');

    console.log('\nStep 2: Permanently purge Entra user (clears MFA / UPN lock)...');
    await permanentlyDeleteEntraUser(graphClient, oldUser.azure_user_id);
  } else {
    console.log('\nStep 1-2: Skipped delete (no DB row); purging any soft-deleted UPN...');
  }

  await purgeDeletedUserByUpn(graphClient, upn);
  await sleep(5000);

  console.log('\nStep 3: Recreate resource group + Entra user...');
  const rg = await provisionResourceGroup({
    requestId: spec.requestId,
    resourceGroupName: spec.resourceGroupName,
    location: spec.location
  });

  const payload = {
    accountEnabled: true,
    displayName: `Customer ${spec.requestId} User ${spec.userNumber}`,
    mailNickname: username,
    userPrincipalName: upn,
    passwordProfile: {
      forceChangePasswordNextSignIn: false,
      password: spec.password
    },
    passwordPolicies: 'DisablePasswordExpiration',
    usageLocation: resolveUsageLocation(spec.location)
  };

  const { user: graphUser } = await createOrAdoptGraphUser(
    graphClient,
    { payload, temporaryPassword: spec.password },
    spec.requestId
  );

  console.log('\nStep 4: Insert DB row + Contributor role...');
  const dbUserId = await insertDbUser({
    requestId: spec.requestId,
    userNumber: spec.userNumber,
    username,
    password: spec.password,
    azureUserId: graphUser.id,
    resourceGroupName: rg.resourceGroupName,
    resourceGroupId: rg.resourceGroupId
  });

  await assignContributor({
    requestId: spec.requestId,
    dbUserId,
    azureUserId: graphUser.id,
    resourceGroupName: rg.resourceGroupName
  });

  console.log('\nStep 5: Reprovision full service roles for request...');
  await reprovisionRolesForRequest(spec.requestId);

  console.log('\n' + '='.repeat(72));
  console.log('DONE — user re-provisioned (fresh Entra account, no MFA)');
  console.log('='.repeat(72));
  console.log(`Username:        ${username}`);
  console.log(`Password:        ${spec.password}`);
  console.log(`Resource group:  ${rg.resourceGroupName}`);
  console.log(`New Entra id:    ${graphUser.id}`);
  console.log(`UPN:             ${upn}`);
  console.log(`Portal:          https://dev.racko.ai/manage-users?token=561e2481-68d5-40c5-b64b-a36904721740`);
}

(async () => {
  const { username, requestId } = parseArgs();
  const spec = USER_SPECS[username];

  if (!spec || spec.requestId !== requestId) {
    throw new Error(
      `No built-in spec for ${username} on request #${requestId}. Add it to USER_SPECS in the script.`
    );
  }

  console.log(APPLY ? 'APPLY MODE' : 'DRY RUN');
  await reprovisionUser(spec, username);
  await db.end();
})().catch(async (error) => {
  console.error('Failed:', error?.body?.error?.message || error.message || error);
  try {
    await db.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
