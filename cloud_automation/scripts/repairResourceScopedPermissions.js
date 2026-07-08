require('dotenv').config();

const db = require('../src/db/postgres');
const roleProvisionService = require('../src/services/roleProvisionService');
const { assignResourceScopedPermissions } = require('../src/provisioners/azure/resourceScopedRoleProvisioner');
const { createAuthorizationClient } = require('../src/provisioners/azure/roleProvisioner');
const { getResourceGroupNameForUser } = require('../src/services/userResourceGroupService');
const { isPerUserCosting } = require('../src/utils/costingMode');

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = { username: null, userId: null, requestId: null, dryRun: false };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--username' && args[i + 1]) {
      options.username = args[++i];
    } else if (arg === '--user-id' && args[i + 1]) {
      options.userId = args[++i];
    } else if (arg === '--request-id' && args[i + 1]) {
      options.requestId = Number(args[++i]);
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
    throw new Error('Provide --username, --user-id, or --request-id.');
  }

  const result = await db.query(
    `
      SELECT au.id, au.username, au.azure_user_id, au.request_id, au.azure_resource_group_name
      FROM azure_users au
      WHERE ${conditions.join(' AND ')}
      ORDER BY au.id
      LIMIT 1
    `,
    values
  );

  return result.rows[0] || null;
};

const getRequestContext = async (requestId) => {
  const result = await db.query(
    `SELECT id, costing_mode, azure_resource_group_name FROM requests WHERE id = $1`,
    [requestId]
  );
  return result.rows[0] || null;
};

const getSelectedServicesForRequest = async (requestId) => {
  const result = await db.query(
    `
      SELECT DISTINCT rs.service_id, s.name AS service_name
      FROM request_services rs
      INNER JOIN services s ON s.id = rs.service_id
      WHERE rs.request_id = $1
      ORDER BY s.name
    `,
    [requestId]
  );

  return result.rows.map((row) => ({
    serviceId: Number(row.service_id),
    serviceName: row.service_name
  }));
};

const resolveUserResourceGroupName = (request, user) => {
  if (isPerUserCosting(request.costing_mode)) {
    return user.azure_resource_group_name;
  }

  return request.azure_resource_group_name;
};

const repairForUser = async ({ username, userId, requestId, dryRun }) => {
  const user = await findUser({ username, userId, requestId });
  if (!user) {
    throw new Error('User not found.');
  }

  const resolvedRequestId = user.request_id;
  const request = await getRequestContext(resolvedRequestId);
  if (!request) {
    throw new Error(`Request ${resolvedRequestId} not found.`);
  }

  const selectedServices = await getSelectedServicesForRequest(resolvedRequestId);
  const resourceGroupName = await getResourceGroupNameForUser(resolvedRequestId, user.id);

  console.log(`User: ${user.username} (id=${user.id}, request=${resolvedRequestId})`);
  console.log(`Resource group: ${resourceGroupName || '(none)'}`);
  console.log(`Selected services: ${selectedServices.map((s) => s.serviceName).join(', ') || '(none)'}`);

  if (dryRun) {
    console.log('Dry run — no Azure changes will be made.');
    return { dryRun: true };
  }

  const { authorizationClient } = createAuthorizationClient();
  const result = await assignResourceScopedPermissions({
    authorizationClient,
    users: [user],
    request,
    requestId: resolvedRequestId,
    selectedServices,
    resolveUserResourceGroupName
  });

  for (const assignment of result.assignments) {
    await db.query(
      `
        INSERT INTO user_role_assignments (
          assignment_id, request_id, user_id, azure_role, scope,
          assignment_status, assigned_at, assignment_kind, created_at
        )
        VALUES ($1, $2, $3, $4, $5, 'assigned', NOW(), $6, NOW())
        ON CONFLICT (request_id, user_id, azure_role) DO UPDATE SET
          scope = EXCLUDED.scope,
          assignment_id = EXCLUDED.assignment_id,
          assignment_status = EXCLUDED.assignment_status,
          assigned_at = EXCLUDED.assigned_at,
          assignment_kind = EXCLUDED.assignment_kind
      `,
      [
        assignment.assignmentId,
        assignment.requestId,
        assignment.userId,
        assignment.azureRole,
        assignment.scope,
        assignment.assignmentKind || 'rbac'
      ]
    );
  }

  console.log(`\nAssigned ${result.assignments.length} resource-scoped permission(s).`);
  if (result.failures.length > 0) {
    console.log('Failures:');
    for (const failure of result.failures) {
      console.log(`  - ${failure.username || user.username} / ${failure.role || 'unknown'} @ ${failure.resourceId || failure.resourceGroupName}: ${failure.message}`);
    }
  } else {
    console.log('All resource-scoped permissions applied successfully.');
  }

  return result;
};

const main = async () => {
  const options = parseArgs();

  if (options.requestId && !options.username && !options.userId) {
    const result = await roleProvisionService.repairResourceScopedPermissionsForRequest(options.requestId);
    console.log(JSON.stringify(result, null, 2));
    await db.end();
    return;
  }

  await repairForUser(options);
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
