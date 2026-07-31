#!/usr/bin/env node
/**
 * Re-provision #307 (11 users) + #309 (1 user) in Azure + DB with known credentials,
 * Contributor RBAC, full service roles, and shared dev Manage Portal link.
 *
 * Usage:
 *   node scripts/reprovisionDevPortalLabs.js            # dry run
 *   node scripts/reprovisionDevPortalLabs.js --apply
 */
require('dotenv').config();

const crypto = require('crypto');
const db = require('../src/db/postgres');
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
const { issueAccessPortalTokenForRequest } = require('../src/services/managePortalService');
const { resolveUsageLocation } = require('../src/utils/azureUsageLocation');

const APPLY = process.argv.includes('--apply');
const PORTAL_TOKEN = '561e2481-68d5-40c5-b64b-a36904721740';
const PORTAL_URL = `https://dev.racko.ai/manage-users?token=${encodeURIComponent(PORTAL_TOKEN)}`;
const PRIMARY_REQUEST_ID = 307;

const LAB_USERS = [
  {
    requestId: 307,
    userNumber: 1,
    username: 'cust-307-user-1',
    password: '5-Ai2F$=d8_9HSFe',
    resourceGroupName: 'RG-CUST-307-U1',
    location: 'southcentralus'
  },
  {
    requestId: 307,
    userNumber: 2,
    username: 'cust-307-user-2',
    password: 'cUF75UufTB+CHLA!',
    resourceGroupName: 'RG-CUST-307-U2',
    location: 'southcentralus'
  },
  {
    requestId: 307,
    userNumber: 3,
    username: 'cust-307-user-3',
    password: '^6%rmxw+fKFcQgM#',
    resourceGroupName: 'RG-CUST-307-U3',
    location: 'southcentralus'
  },
  {
    requestId: 307,
    userNumber: 4,
    username: 'cust-307-user-4',
    password: 'nkgW5FhVAE4nD&5N',
    resourceGroupName: 'RG-CUST-307-U4',
    location: 'southcentralus'
  },
  {
    requestId: 307,
    userNumber: 5,
    username: 'cust-307-user-5',
    password: 'ojb6@&hF8ahwNX_z',
    resourceGroupName: 'RG-CUST-307-U5',
    location: 'southcentralus'
  },
  {
    requestId: 307,
    userNumber: 6,
    username: 'cust-307-user-6',
    password: 'gNWFcZ63+PP@^Ddc',
    resourceGroupName: 'RG-CUST-307-U6',
    location: 'southcentralus'
  },
  {
    requestId: 307,
    userNumber: 7,
    username: 'cust-307-user-7',
    password: 'qcc^Q-NL7EU8-U8M',
    resourceGroupName: 'RG-CUST-307-U7',
    location: 'southcentralus'
  },
  {
    requestId: 307,
    userNumber: 8,
    username: 'cust-307-user-8',
    password: '%gRabb7RCCNwA9qi',
    resourceGroupName: 'RG-CUST-307-U8',
    location: 'southcentralus'
  },
  {
    requestId: 307,
    userNumber: 9,
    username: 'cust-307-user-9',
    password: 'NwWtAHz4F=4Bkwa$',
    resourceGroupName: 'RG-CUST-307-U9',
    location: 'southcentralus'
  },
  {
    requestId: 307,
    userNumber: 10,
    username: 'cust-307-user-10',
    password: '*q=dre5Fi@ZGk6AC',
    resourceGroupName: 'RG-CUST-307-U10',
    location: 'southcentralus'
  },
  {
    requestId: 307,
    userNumber: 11,
    username: 'cust-307-user-11',
    password: '@34BMbf$o6SpXG5W',
    resourceGroupName: 'RG-CUST-307-U11',
    location: 'southcentralus'
  },
  {
    requestId: 309,
    userNumber: 1,
    username: 'cust-309-user-1',
    password: 'VnynxCg@_2j*c*#N',
    resourceGroupName: 'RG-CUST-309-U1',
    location: 'southindia'
  }
];

const sha256Hex = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function assignContributor({ requestId, dbUserId, azureUserId, resourceGroupName }) {
  const { authorizationClient, subscriptionId } = createAuthorizationClient();
  const scope = buildResourceGroupScope(subscriptionId, resourceGroupName);
  const roleDefinition = await findMatchingRoleDefinition(authorizationClient, scope, 'Contributor');

  if (!roleDefinition?.id) {
    throw new Error(`Contributor role not found at scope ${scope}`);
  }

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

async function upsertDbUser({
  requestId,
  userNumber,
  username,
  password,
  azureUserId,
  resourceGroupName,
  resourceGroupId
}) {
  const existing = await db.query(
    `
      SELECT id
      FROM azure_users
      WHERE request_id = $1
        AND lower(username) = lower($2)
      LIMIT 1
    `,
    [requestId, username]
  );

  if (existing.rows.length) {
    const updated = await db.query(
      `
        UPDATE azure_users
        SET
          azure_user_id = $2,
          temporary_password = $3,
          status = 'Created',
          user_number = $4,
          azure_resource_group_name = $5,
          azure_resource_group_id = $6,
          azure_account_enabled = TRUE,
          is_deleted = FALSE,
          deleted_at = NULL,
          blocked_reason = NULL,
          blocked_at = NULL,
          blocked_until = NULL
        WHERE id = $1
        RETURNING id
      `,
      [
        existing.rows[0].id,
        azureUserId,
        password,
        userNumber,
        resourceGroupName,
        resourceGroupId
      ]
    );
    return updated.rows[0].id;
  }

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

  return inserted.rows[0].id;
}

async function ensureUserResourceGroupRow({ requestId, userNumber, resourceGroupName }) {
  await db.query(
    `
      INSERT INTO request_user_resource_groups (request_id, user_number, azure_resource_group_name)
      VALUES ($1, $2, $3)
      ON CONFLICT (request_id, user_number) DO UPDATE
      SET azure_resource_group_name = EXCLUDED.azure_resource_group_name
    `,
    [requestId, userNumber, resourceGroupName]
  );
}

async function provisionLabUser(spec, graphClient, domain) {
  const usageLocation = resolveUsageLocation(spec.location);
  const upn = `${spec.username}@${domain}`;
  const payload = {
    accountEnabled: true,
    displayName: `Customer ${spec.requestId} User ${spec.userNumber}`,
    mailNickname: spec.username,
    userPrincipalName: upn,
    passwordProfile: {
      forceChangePasswordNextSignIn: false,
      password: spec.password
    },
    passwordPolicies: 'DisablePasswordExpiration',
    usageLocation
  };

  console.log(`\n[${spec.requestId}] ${spec.username}`);
  if (!APPLY) {
    console.log(`  dry-run: would create RG ${spec.resourceGroupName}, Entra user ${upn}, Contributor`);
    return { username: spec.username, dryRun: true };
  }

  const rg = await provisionResourceGroup({
    requestId: spec.requestId,
    resourceGroupName: spec.resourceGroupName,
    location: spec.location
  });

  const { user: graphUser, adopted } = await createOrAdoptGraphUser(
    graphClient,
    { payload, temporaryPassword: spec.password },
    spec.requestId
  );

  const dbUserId = await upsertDbUser({
    requestId: spec.requestId,
    userNumber: spec.userNumber,
    username: spec.username,
    password: spec.password,
    azureUserId: graphUser.id,
    resourceGroupName: rg.resourceGroupName,
    resourceGroupId: rg.resourceGroupId
  });

  await ensureUserResourceGroupRow({
    requestId: spec.requestId,
    userNumber: spec.userNumber,
    resourceGroupName: rg.resourceGroupName
  });

  await assignContributor({
    requestId: spec.requestId,
    dbUserId,
    azureUserId: graphUser.id,
    resourceGroupName: rg.resourceGroupName
  });

  console.log(
    `  ✓ RG ${rg.resourceGroupName} | Entra ${graphUser.id}${adopted ? ' (adopted)' : ''} | Contributor`
  );

  return {
    username: spec.username,
    azureUserId: graphUser.id,
    resourceGroupName: rg.resourceGroupName,
    dbUserId
  };
}

async function ensurePortalAliasFor309() {
  const source = await db.query(
    `
      SELECT *
      FROM azure_users
      WHERE request_id = 309
        AND lower(username) = lower('cust-309-user-1')
        AND COALESCE(is_deleted, false) = false
      LIMIT 1
    `
  );

  if (!source.rows.length) {
    throw new Error('cust-309-user-1 missing on request #309 after reprovision');
  }

  const user = source.rows[0];
  const existingAlias = await db.query(
    `
      SELECT id
      FROM azure_users
      WHERE request_id = $1
        AND lower(username) = lower($2)
        AND COALESCE(is_deleted, false) = false
      LIMIT 1
    `,
    [PRIMARY_REQUEST_ID, user.username]
  );

  if (existingAlias.rows.length) {
    await db.query(
      `
        UPDATE azure_users
        SET
          temporary_password = $2,
          azure_user_id = $3,
          azure_resource_group_name = $4,
          azure_resource_group_id = $5,
          status = 'Created',
          azure_account_enabled = TRUE,
          is_deleted = false,
          deleted_at = NULL
        WHERE id = $1
      `,
      [
        existingAlias.rows[0].id,
        user.temporary_password,
        user.azure_user_id,
        user.azure_resource_group_name,
        user.azure_resource_group_id
      ]
    );
  } else {
    const nextUserNumber = await db.query(
      `SELECT COALESCE(MAX(user_number), 0) + 1 AS next_number FROM azure_users WHERE request_id = $1`,
      [PRIMARY_REQUEST_ID]
    );

    await db.query(
      `
        INSERT INTO azure_users (
          request_id, azure_user_id, username, temporary_password, status,
          user_number, azure_resource_group_name, azure_resource_group_id,
          azure_account_enabled, is_deleted
        )
        VALUES ($1, $2, $3, $4, 'Created', $5, $6, $7, TRUE, FALSE)
      `,
      [
        PRIMARY_REQUEST_ID,
        user.azure_user_id,
        user.username,
        user.temporary_password,
        nextUserNumber.rows[0].next_number,
        user.azure_resource_group_name,
        user.azure_resource_group_id
      ]
    );
  }
}

async function seedSharedPortalToken(customerEmail) {
  const tokenHash = sha256Hex(PORTAL_TOKEN);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const existing = await db.query(
    `SELECT id FROM access_portal_tokens WHERE token_hash = $1 LIMIT 1`,
    [tokenHash]
  );

  if (existing.rows.length) {
    await db.query(
      `
        UPDATE access_portal_tokens
        SET request_id = $2,
            customer_email = $3,
            expires_at = $4,
            used = false,
            used_at = NULL
        WHERE token_hash = $1
      `,
      [tokenHash, PRIMARY_REQUEST_ID, customerEmail, expiresAt]
    );
  } else {
    await db.query(
      `
        INSERT INTO access_portal_tokens (id, request_id, customer_email, token_hash, expires_at, used)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, false)
      `,
      [PRIMARY_REQUEST_ID, customerEmail, tokenHash, expiresAt]
    );
  }

  return expiresAt;
}

(async () => {
  console.log(APPLY ? 'APPLY MODE — provisioning Azure + DB' : 'DRY RUN — pass --apply to execute');
  console.log(`Shared portal: ${PORTAL_URL}`);
  console.log(`Users: ${LAB_USERS.length}`);

  const request307 = await db.query(
    `SELECT id, customer_email, project_name, location FROM requests WHERE id = 307`
  );
  if (!request307.rows.length) {
    throw new Error('Request #307 not found in DB');
  }

  const { graphClient } = createGraphClient();
  const domain = await getVerifiedDomain(graphClient);
  const results = [];

  for (const spec of LAB_USERS) {
    const result = await provisionLabUser(spec, graphClient, domain);
    results.push(result);
    if (APPLY) {
      await sleep(1500);
    }
  }

  if (APPLY) {
    console.log('\nReprovisioning full service roles...');
    for (const requestId of [307, 309]) {
      console.log(`  request #${requestId}...`);
      await reprovisionRolesForRequest(requestId);
    }

    console.log('\nEnsuring cust-309-user-1 portal alias on request #307...');
    await ensurePortalAliasFor309();

    const expiresAt = await seedSharedPortalToken(request307.rows[0].customer_email);
    const adminPortal = await issueAccessPortalTokenForRequest(PRIMARY_REQUEST_ID);

    console.log('\n' + '='.repeat(72));
    console.log('DONE — shared dev portal');
    console.log('='.repeat(72));
    console.log(PORTAL_URL);
    console.log(`Token expires: ${expiresAt}`);
    console.log(`Admin: ${adminPortal.adminCredentials?.username} / ${adminPortal.adminCredentials?.temporaryPassword}`);
    console.log('\nProvisioned users:');
    for (const row of results) {
      console.log(`  ${row.username}  azureUserId=${row.azureUserId}  RG=${row.resourceGroupName}`);
    }
  } else {
    console.log('\nDry run complete. Re-run with --apply to provision.');
  }

  await db.end();
})().catch(async (error) => {
  console.error('Reprovision failed:', error?.response?.data?.error?.message || error.message || error);
  try {
    await db.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
