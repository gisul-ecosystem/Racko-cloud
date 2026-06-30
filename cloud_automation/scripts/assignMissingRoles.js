require('dotenv').config();
const db = require('../src/db/postgres');
const {
  buildResourceGroupScope,
  createAuthorizationClient,
  createRoleAssignmentWithRetry,
  findMatchingRoleDefinition,
  getExistingAzureAssignment,
  roleAssignmentIdFromSeed
} = require('../src/provisioners/azure/roleProvisioner');
const { getResourceGroupNameForUser } = require('../src/services/userResourceGroupService');
 
const DEFAULT_ROLES = [
  'Azure AI Developer',
  'AzureML Compute Operator',
  'Cognitive Services OpenAI Contributor',
  'Cognitive Services User',
  'Key Vault Reader',
  'Key Vault Secrets User',
  'Search Index Data Contributor',
  'Storage Blob Data Contributor',
  'Storage Blob Data Owner',
  'Storage Blob Data Reader'
];

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = { username: null, userId: null, requestId: null, roles: DEFAULT_ROLES, dryRun: false };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--username' && args[i + 1]) {
      options.username = args[++i];
    } else if (arg === '--user-id' && args[i + 1]) {
      options.userId = args[++i];
    } else if (arg === '--request-id' && args[i + 1]) {
      options.requestId = Number(args[++i]);
    } else if (arg === '--roles' && args[i + 1]) {
      options.roles = args[++i].split(',').map((r) => r.trim()).filter(Boolean);
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
};

const findUser = async ({ username, userId, requestId }) => {
  const conditions = ['COALESCE(au.is_deleted, FALSE) = FALSE'];
  const values = [];

  if (userId) {
    values.push(userId);
    conditions.push(`au.id = $${values.length}`);
  }

  if (username) {
    values.push(username);
    conditions.push(`au.username ILIKE $${values.length}`);
  }

  if (requestId) {
    values.push(requestId);
    conditions.push(`au.request_id = $${values.length}`);
  }

  if (values.length === 0) {
    throw new Error('Provide --username, --user-id, or both with --request-id.');
  }

  const result = await db.query(
    `
      SELECT au.id, au.username, au.azure_user_id, au.request_id
      FROM azure_users au
      WHERE ${conditions.join(' AND ')}
      ORDER BY au.id
      LIMIT 1
    `,
    values
  );

  return result.rows[0] || null;
};

const getExistingRoles = async (requestId, userId) => {
  const result = await db.query(
    `SELECT azure_role FROM user_role_assignments WHERE request_id = $1 AND user_id = $2`,
    [requestId, userId]
  );
  return new Set(result.rows.map((row) => row.azure_role));
};

const assignMissingRoles = async ({ username, userId, requestId, roles, dryRun }) => {
  const user = await findUser({ username, userId, requestId });
  if (!user) {
    throw new Error('User not found.');
  }

  const resolvedRequestId = user.request_id;
  const existingRoles = await getExistingRoles(resolvedRequestId, user.id);
  const rolesToAdd = roles.filter((role) => !existingRoles.has(role));

  const resourceGroupName = await getResourceGroupNameForUser(resolvedRequestId, user.id);
  if (!resourceGroupName) {
    throw new Error(`No resource group found for user ${user.username}.`);
  }

  const { authorizationClient, subscriptionId } = createAuthorizationClient();
  const scope = buildResourceGroupScope(subscriptionId, resourceGroupName);

  console.log(`User: ${user.username} (id=${user.id}, request=${resolvedRequestId})`);
  console.log(`Resource group: ${resourceGroupName}`);
  console.log(`Existing roles (${existingRoles.size}):`, [...existingRoles].sort().join(', ') || '(none)');
  console.log(`Roles to add (${rolesToAdd.length}):`, rolesToAdd.join(', ') || '(none)');

  if (rolesToAdd.length === 0) {
    console.log('Nothing to do.');
    return { assigned: [], skipped: roles };
  }

  if (dryRun) {
    console.log('Dry run — no changes made.');
    return { assigned: [], skipped: [...existingRoles], pending: rolesToAdd };
  }

  const assigned = [];

  for (const roleName of rolesToAdd) {
    const roleDefinition = await findMatchingRoleDefinition(authorizationClient, scope, roleName);
    if (!roleDefinition?.id) {
      throw new Error(`Unable to resolve Azure role "${roleName}" at scope ${scope}.`);
    }

    const assignmentSeed = [resolvedRequestId, user.id, roleDefinition.id, scope].join(':');
    const assignmentId = roleAssignmentIdFromSeed(assignmentSeed);
    const existingAzureAssignment = await getExistingAzureAssignment(authorizationClient, scope, assignmentId);

    if (!existingAzureAssignment) {
      try {
        await createRoleAssignmentWithRetry(
          authorizationClient,
          scope,
          assignmentId,
          {
            principalId: user.azure_user_id,
            roleDefinitionId: roleDefinition.id,
            principalType: 'User'
          },
          resolvedRequestId
        );
        console.log(`  + Assigned in Azure: ${roleName}`);
      } catch (error) {
        if (error?.statusCode !== 409 && error?.code !== 'RoleAssignmentExists') {
          throw error;
        }
        console.log(`  ~ Already exists in Azure: ${roleName}`);
      }
    } else {
      console.log(`  ~ Already exists in Azure: ${roleName}`);
    }

    await db.query(
      `
        INSERT INTO user_role_assignments (
          assignment_id, request_id, user_id, azure_role, scope,
          assignment_status, assigned_at, assignment_kind, created_at
        )
        VALUES ($1, $2, $3, $4, $5, 'assigned', NOW(), 'rbac', NOW())
        ON CONFLICT (request_id, user_id, azure_role) DO NOTHING
      `,
      [assignmentId, resolvedRequestId, user.id, roleName, scope]
    );

    assigned.push(roleName);
  }

  console.log(`\nDone. Added ${assigned.length} role(s).`);
  return { assigned, skipped: [...existingRoles] };
};

const main = async () => {
  const options = parseArgs();
  await assignMissingRoles(options);
  await db.end();
};

main().catch(async (error) => {
  console.error('Failed:', error.message);
  try {
    await db.end();
  } catch (_) {
    // ignore
  }
  process.exit(1);
});
