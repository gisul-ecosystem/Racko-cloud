const crypto = require('crypto');
const { AuthorizationManagementClient } = require('@azure/arm-authorization');
const db = require('../db/postgres');
const { createAzureCredential, validateAzureEnv } = require('../config/azure');
const AppError = require('../utils/AppError');
const { getUsersForRequest } = require('./userProvisionService');

let authClient = null;
let subscriptionId = null;

const getAuthClient = () => {
  if (authClient) {
    return { authClient, subscriptionId };
  }

  const azureConfig = validateAzureEnv();
  const credential = createAzureCredential(azureConfig);
  authClient = new AuthorizationManagementClient(credential, azureConfig.subscriptionId);
  subscriptionId = azureConfig.subscriptionId;

  return { authClient, subscriptionId };
};

const parsePermissions = (value) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
};

const createCustomRoleDefinition = async ({ name, description, permissions, createdBy }) => {
  const validPermissions = permissions.filter(
    (permission) => typeof permission === 'string' && permission.includes('/')
  );

  if (validPermissions.length === 0) {
    throw new AppError(
      'At least one valid permission is required (e.g. Microsoft.Storage/*/read)',
      400
    );
  }

  const result = await db.query(
    `
    INSERT INTO custom_role_definitions (name, description, permissions, created_by)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `,
    [name, description, JSON.stringify(validPermissions), createdBy]
  );

  return result.rows[0];
};

const listCustomRoleDefinitions = async () => {
  const result = await db.query(`
    SELECT * FROM custom_role_definitions
    ORDER BY created_at DESC
  `);
  return result.rows;
};

const updateCustomRoleDefinition = async (id, { name, description, permissions }) => {
  const result = await db.query(
    `
    UPDATE custom_role_definitions
    SET name = COALESCE($1, name),
        description = COALESCE($2, description),
        permissions = COALESCE($3, permissions),
        updated_at = NOW()
    WHERE id = $4
    RETURNING *
  `,
    [name, description, permissions ? JSON.stringify(permissions) : null, id]
  );

  if (result.rows.length === 0) {
    throw new AppError('Custom role not found', 404);
  }

  return result.rows[0];
};

const deleteCustomRoleDefinition = async (id) => {
  await db.query('DELETE FROM custom_role_definitions WHERE id = $1', [id]);
};

const ensureAzureCustomRoleDefinition = async ({ roleName, permissions, subId }) => {
  const { authClient: client } = getAuthClient();
  const scope = `/subscriptions/${subId}`;

  const existingRoles = client.roleDefinitions.list(scope, {
    filter: `roleName eq '${roleName}'`
  });

  for await (const role of existingRoles) {
    if (role.roleName === roleName) {
      return role.name;
    }
  }

  const roleDefId = crypto.randomUUID();

  const created = await client.roleDefinitions.createOrUpdate(scope, roleDefId, {
    roleName,
    description: 'Custom lab role created by Racko org admin',
    type: 'CustomRole',
    assignableScopes: [scope],
    permissions: [
      {
        actions: permissions.filter((permission) => !permission.startsWith('!')),
        notActions: permissions
          .filter((permission) => permission.startsWith('!'))
          .map((permission) => permission.slice(1)),
        dataActions: [],
        notDataActions: []
      }
    ]
  });

  return created.name;
};

const assignCustomRoleToUser = async ({
  requestId,
  azureUserId,
  username,
  customRoleDefId,
  permissions,
  resourceGroupName,
  assignedBy
}) => {
  const { authClient: client, subscriptionId: subId } = getAuthClient();
  const resolvedPermissions = parsePermissions(permissions);

  if (resolvedPermissions.length === 0) {
    throw new AppError('At least one valid permission is required', 400);
  }

  const azureRoleDefId = await ensureAzureCustomRoleDefinition({
    roleName: `RackoCustom-${username}-${Date.now()}`,
    permissions: resolvedPermissions,
    subId
  });

  const scope = `/subscriptions/${subId}/resourceGroups/${resourceGroupName}`;
  const assignmentId = crypto.randomUUID();

  await client.roleAssignments.create(scope, assignmentId, {
    principalId: azureUserId,
    roleDefinitionId: `/subscriptions/${subId}/providers/Microsoft.Authorization/roleDefinitions/${azureRoleDefId}`,
    principalType: 'User'
  });

  const result = await db.query(
    `
    INSERT INTO custom_role_assignments
      (request_id, azure_user_id, username, custom_role_def_id, custom_role_name, azure_role_def_id, permissions, assigned_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `,
    [
      requestId,
      azureUserId,
      username,
      customRoleDefId || null,
      `RackoCustom-${username}`,
      azureRoleDefId,
      JSON.stringify(resolvedPermissions),
      assignedBy
    ]
  );

  return result.rows[0];
};

const revokeCustomRoleAssignment = async (assignmentId) => {
  const { authClient: client, subscriptionId: subId } = getAuthClient();

  const result = await db.query(
    `
    SELECT cra.*, au.azure_resource_group_name
    FROM custom_role_assignments cra
    JOIN requests r ON r.id = cra.request_id
    LEFT JOIN azure_users au
      ON au.request_id = cra.request_id
      AND au.azure_user_id = cra.azure_user_id
    WHERE cra.id = $1
  `,
    [assignmentId]
  );

  if (result.rows.length === 0) {
    throw new AppError('Assignment not found', 404);
  }

  const assignment = result.rows[0];
  const resourceGroupName =
    assignment.azure_resource_group_name || assignment.azure_region || null;

  try {
    const scope = resourceGroupName
      ? `/subscriptions/${subId}/resourceGroups/${resourceGroupName}`
      : `/subscriptions/${subId}`;

    const assignments = client.roleAssignments.listForScope(scope, {
      filter: `principalId eq '${assignment.azure_user_id}'`
    });

    for await (const roleAssignment of assignments) {
      if (roleAssignment.roleDefinitionId?.includes(assignment.azure_role_def_id)) {
        await client.roleAssignments.deleteById(roleAssignment.id);
        break;
      }
    }
  } catch (error) {
    console.warn(`[customRole] Azure revoke warning: ${error.message}`);
  }

  await db.query(
    `
    UPDATE custom_role_assignments
    SET status = 'revoked', revoked_at = NOW()
    WHERE id = $1
  `,
    [assignmentId]
  );
};

const getCustomRoleAssignmentsForRequest = async (requestId) => {
  const result = await db.query(
    `
    SELECT cra.*, crd.permissions AS def_permissions
    FROM custom_role_assignments cra
    LEFT JOIN custom_role_definitions crd ON crd.id = cra.custom_role_def_id
    WHERE cra.request_id = $1
      AND cra.status = 'active'
    ORDER BY cra.assigned_at DESC
  `,
    [requestId]
  );
  return result.rows;
};

const getCustomRoleDefinitionById = async (id) => {
  const result = await db.query('SELECT * FROM custom_role_definitions WHERE id = $1', [id]);
  return result.rows[0] || null;
};

const resolveResourceGroupName = (user, requestId) =>
  user.resourceGroup ||
  user.azure_resource_group_name ||
  `RG-CUST-${requestId}-U${user.userNumber || user.user_number || 1}`;

const userHasActiveCustomRoleDef = async (requestId, azureUserId, customRoleDefId) => {
  if (!customRoleDefId) {
    return false;
  }

  const result = await db.query(
    `
    SELECT id
    FROM custom_role_assignments
    WHERE request_id = $1
      AND azure_user_id = $2
      AND custom_role_def_id = $3
      AND status = 'active'
    LIMIT 1
  `,
    [requestId, azureUserId, customRoleDefId]
  );

  return result.rows.length > 0;
};

const assignCustomRoleToAllUsersInRequest = async ({
  requestId,
  customRoleDefId,
  permissions,
  assignedBy,
  skipExisting = true
}) => {
  if (!permissions?.length && !customRoleDefId) {
    throw new AppError('Either customRoleDefId or permissions required', 400);
  }

  let resolvedPermissions = permissions;

  if (customRoleDefId && !permissions?.length) {
    const roleDefinition = await getCustomRoleDefinitionById(Number(customRoleDefId));

    if (!roleDefinition) {
      throw new AppError('Custom role definition not found', 404);
    }

    resolvedPermissions = parsePermissions(roleDefinition.permissions);
  } else {
    resolvedPermissions = parsePermissions(resolvedPermissions);
  }

  if (resolvedPermissions.length === 0) {
    throw new AppError('At least one valid permission is required', 400);
  }

  const users = await getUsersForRequest(requestId);

  if (users.length === 0) {
    throw new AppError('No users found for this request', 404);
  }

  const assigned = [];
  const skipped = [];
  const failed = [];

  for (const user of users) {
    if (!user.azureUserId) {
      failed.push({ username: user.username, reason: 'Missing Azure user ID' });
      continue;
    }

    if (
      skipExisting &&
      (await userHasActiveCustomRoleDef(requestId, user.azureUserId, customRoleDefId || null))
    ) {
      skipped.push({ username: user.username, reason: 'Already has this role' });
      continue;
    }

    try {
      const assignment = await assignCustomRoleToUser({
        requestId,
        azureUserId: user.azureUserId,
        username: user.username,
        customRoleDefId: customRoleDefId || null,
        permissions: resolvedPermissions,
        resourceGroupName: resolveResourceGroupName(user, requestId),
        assignedBy
      });

      assigned.push({
        username: user.username,
        assignmentId: assignment.id
      });
    } catch (error) {
      failed.push({
        username: user.username,
        reason: error.message || 'Assignment failed'
      });
    }
  }

  return {
    requestId,
    totalUsers: users.length,
    assignedCount: assigned.length,
    skippedCount: skipped.length,
    failedCount: failed.length,
    assigned,
    skipped,
    failed
  };
};

module.exports = {
  assignCustomRoleToAllUsersInRequest,
  assignCustomRoleToUser,
  createCustomRoleDefinition,
  deleteCustomRoleDefinition,
  getCustomRoleAssignmentsForRequest,
  getCustomRoleDefinitionById,
  listCustomRoleDefinitions,
  revokeCustomRoleAssignment,
  updateCustomRoleDefinition
};
