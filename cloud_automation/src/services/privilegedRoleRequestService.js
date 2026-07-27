const db = require('../db/postgres');
const AppError = require('../utils/AppError');
const {
  PRIVILEGED_AZURE_ROLES,
  assertPrivilegedAzureRole
} = require('../constants/privilegedAzureRoles');
const { getResourceGroupNameForUser } = require('./userResourceGroupService');
const {
  buildResourceGroupScope,
  createAuthorizationClient,
  createRoleAssignmentWithRetry,
  findMatchingRoleDefinition,
  getExistingAzureAssignment,
  roleAssignmentIdFromSeed
} = require('../provisioners/azure/roleProvisioner');
const { createNotification, NotificationType } = require('./notificationService');

const mapRow = (row) => ({
  id: row.id,
  requestId: row.request_id,
  customerEmail: row.customer_email,
  azureRole: row.azure_role,
  status: row.status,
  reviewedBy: row.reviewed_by,
  reviewedAt: row.reviewed_at,
  reviewNotes: row.review_notes,
  createdAt: row.created_at
});

const logPrivilegedRoleEvent = (level, event, details = {}) => {
  const entry = {
    timestamp: new Date().toISOString(),
    service: 'privileged-role-request',
    level,
    event,
    ...details
  };

  const message = JSON.stringify(entry);

  if (level === 'error') {
    console.error(message);
    return;
  }

  console.log(message);
};

const listAssignablePrivilegedRoles = () => [...PRIVILEGED_AZURE_ROLES];

const requestHasProvisionedUsers = async (requestId) => {
  const result = await db.query(
    `
      SELECT COUNT(*)::int AS user_count
      FROM azure_users
      WHERE request_id = $1
        AND COALESCE(is_deleted, false) = false
        AND azure_user_id IS NOT NULL
    `,
    [requestId]
  );

  return Number(result.rows[0]?.user_count || 0) > 0;
};

const requestHasResourceGroup = async (requestId) => {
  const result = await db.query(
    `
      SELECT azure_resource_group_name, costing_mode
      FROM requests
      WHERE id = $1
      LIMIT 1
    `,
    [requestId]
  );

  const row = result.rows[0];
  if (!row) return false;

  if (String(row.costing_mode || '').toLowerCase() === 'per_user') {
    const staged = await db.query(
      `
        SELECT COUNT(*)::int AS count
        FROM request_user_resource_groups
        WHERE request_id = $1
      `,
      [requestId]
    );
    return Number(staged.rows[0]?.count || 0) > 0;
  }

  return Boolean(String(row.azure_resource_group_name || '').trim());
};

const resolveScopeForUser = async (requestId, userId) => {
  const resourceGroupName = await getResourceGroupNameForUser(requestId, userId);

  if (!resourceGroupName) {
    throw new AppError(`User ${userId} does not have a provisioned resource group.`, 400);
  }

  const { subscriptionId } = createAuthorizationClient();
  return buildResourceGroupScope(subscriptionId, String(resourceGroupName).trim());
};

const assignPrivilegedRoleToAllUsers = async ({ requestId, azureRole, reviewedBy = null }) => {
  const roleName = assertPrivilegedAzureRole(azureRole);
  const rid = Number(requestId);

  if (!Number.isInteger(rid) || rid <= 0) {
    throw new AppError('requestId must be a positive integer.', 400);
  }

  const hasUsers = await requestHasProvisionedUsers(rid);
  const hasResourceGroup = await requestHasResourceGroup(rid);

  if (!hasUsers || !hasResourceGroup) {
    return {
      requestId: rid,
      azureRole: roleName,
      accessApplied: false,
      rolesAssigned: 0,
      usersProcessed: 0
    };
  }

  const usersResult = await db.query(
    `
      SELECT id, azure_user_id
      FROM azure_users
      WHERE request_id = $1
        AND COALESCE(is_deleted, false) = false
        AND azure_user_id IS NOT NULL
      ORDER BY id ASC
    `,
    [rid]
  );

  const users = usersResult.rows;

  if (users.length === 0) {
    return {
      requestId: rid,
      azureRole: roleName,
      accessApplied: false,
      rolesAssigned: 0,
      usersProcessed: 0
    };
  }

  const { authorizationClient } = createAuthorizationClient();
  let rolesAssigned = 0;

  for (const user of users) {
    const existingResult = await db.query(
      `
        SELECT assignment_id
        FROM user_role_assignments
        WHERE request_id = $1
          AND user_id = $2
          AND lower(azure_role) = lower($3)
        LIMIT 1
      `,
      [rid, user.id, roleName]
    );

    if (existingResult.rows.length > 0) {
      continue;
    }

    const scope = await resolveScopeForUser(rid, user.id);
    const roleDefinition = await findMatchingRoleDefinition(authorizationClient, scope, roleName);

    if (!roleDefinition?.id) {
      throw new AppError(`Unable to resolve Azure role "${roleName}" at resource group scope.`, 404);
    }

    const assignmentSeed = [rid, user.id, 'privileged', roleDefinition.id, scope].join(':');
    const assignmentId = roleAssignmentIdFromSeed(assignmentSeed);
    const existingAzureAssignment = await getExistingAzureAssignment(
      authorizationClient,
      scope,
      assignmentId
    );

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
          rid
        );
      } catch (error) {
        if (error?.statusCode !== 409 && error?.code !== 'RoleAssignmentExists') {
          throw error;
        }
      }
    }

    await db.query(
      `
        INSERT INTO user_role_assignments (
          assignment_id,
          request_id,
          user_id,
          azure_role,
          scope,
          assignment_status,
          assigned_at,
          assignment_kind,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, 'assigned', NOW(), 'rbac', NOW())
        ON CONFLICT (request_id, user_id, azure_role) DO NOTHING
      `,
      [assignmentId, rid, user.id, roleName, scope]
    );

    rolesAssigned += 1;
  }

  logPrivilegedRoleEvent('info', 'privileged_role_assigned_to_all_users', {
    requestId: rid,
    azureRole: roleName,
    rolesAssigned,
    usersProcessed: users.length,
    reviewedBy
  });

  return {
    requestId: rid,
    azureRole: roleName,
    accessApplied: rolesAssigned > 0,
    rolesAssigned,
    usersProcessed: users.length
  };
};

const findProvisionedRequestId = async ({ requestId, customerEmail }) => {
  const parsedRequestId = Number(requestId);

  if (Number.isInteger(parsedRequestId) && parsedRequestId > 0) {
    return parsedRequestId;
  }

  const email = String(customerEmail || '').trim().toLowerCase();

  if (!email) {
    return null;
  }

  const result = await db.query(
    `
      SELECT r.id
      FROM requests r
      WHERE lower(r.customer_email) = $1
        AND (
          r.azure_resource_group_name IS NOT NULL
          OR r.costing_mode = 'per_user'
        )
      ORDER BY r.created_at DESC
      LIMIT 1
    `,
    [email]
  );

  return result.rows[0]?.id || null;
};

const applyApprovedPrivilegedRoleRequest = async (privilegedRequest) => {
  const resolvedRequestId = await findProvisionedRequestId({
    requestId: privilegedRequest.requestId,
    customerEmail: privilegedRequest.customerEmail
  });

  if (!resolvedRequestId) {
    return {
      requestId: null,
      azureRole: privilegedRequest.azureRole,
      accessApplied: false,
      rolesAssigned: 0,
      usersProcessed: 0
    };
  }

  if (privilegedRequest.id && Number(privilegedRequest.requestId) !== Number(resolvedRequestId)) {
    await db.query(
      `
        UPDATE privileged_role_requests
        SET request_id = $2
        WHERE id = $1
      `,
      [privilegedRequest.id, resolvedRequestId]
    );
  }

  return assignPrivilegedRoleToAllUsers({
    requestId: resolvedRequestId,
    azureRole: privilegedRequest.azureRole,
    reviewedBy: privilegedRequest.reviewedBy
  });
};

const createPrivilegedRoleRequest = async ({ customerEmail, azureRole, requestId }) => {
  const email = String(customerEmail || '').trim().toLowerCase();
  const roleName = assertPrivilegedAzureRole(azureRole);
  const parsedRequestId = requestId ? Number(requestId) : null;

  if (!email) {
    throw new AppError('customerEmail is required.', 400);
  }

  const result = await db.query(
    `
      INSERT INTO privileged_role_requests (
        request_id,
        customer_email,
        azure_role,
        status
      )
      VALUES ($1, $2, $3, 'pending')
      RETURNING *
    `,
    [
      Number.isInteger(parsedRequestId) && parsedRequestId > 0 ? parsedRequestId : null,
      email,
      roleName
    ]
  );

  const privilegedRequest = mapRow(result.rows[0]);

  await createNotification({
    type: NotificationType.PRIVILEGED_ROLE_REQUEST,
    title: 'New privileged role request',
    message: `${roleName} requested for Lab #${privilegedRequest.requestId || 'pending'} by ${email}`,
    requestId: privilegedRequest.requestId
  });

  return privilegedRequest;
};

const linkPrivilegedRoleRequestsToRequest = async ({ customerEmail, requestId, client = db }) => {
  const email = String(customerEmail || '').trim().toLowerCase();
  const rid = Number(requestId);

  if (!email || !Number.isInteger(rid) || rid <= 0) {
    return { linkedCount: 0 };
  }

  const result = await client.query(
    `
      UPDATE privileged_role_requests
      SET request_id = $2
      WHERE customer_email = $1
        AND request_id IS NULL
      RETURNING id
    `,
    [email, rid]
  );

  return { linkedCount: result.rows.length };
};

const fulfillLinkedApprovedPrivilegedRoleRequests = async ({ customerEmail, requestId }) => {
  const email = String(customerEmail || '').trim().toLowerCase();
  const rid = Number(requestId);

  if (!email || !Number.isInteger(rid) || rid <= 0) {
    return { fulfilledCount: 0 };
  }

  const result = await db.query(
    `
      SELECT *
      FROM privileged_role_requests
      WHERE customer_email = $1
        AND request_id = $2
        AND status = 'approved'
    `,
    [email, rid]
  );

  let fulfilledCount = 0;

  for (const row of result.rows) {
    const privilegedRequest = mapRow(row);
    const fulfillment = await applyApprovedPrivilegedRoleRequest(privilegedRequest);

    if (fulfillment.accessApplied) {
      fulfilledCount += 1;
    }
  }

  return { fulfilledCount };
};

const listPrivilegedRoleRequests = async ({ status, requestId } = {}) => {
  const conditions = [];
  const params = [];

  if (status) {
    params.push(String(status).trim().toLowerCase());
    conditions.push(`prr.status = $${params.length}`);
  }

  if (requestId) {
    params.push(Number(requestId));
    conditions.push(`prr.request_id = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await db.query(
    `
      SELECT
        prr.*,
        r.azure_resource_group_name,
        r.location AS request_location,
        r.status AS request_status
      FROM privileged_role_requests prr
      LEFT JOIN requests r ON r.id = prr.request_id
      ${whereClause}
      ORDER BY prr.created_at DESC
    `,
    params
  );

  return result.rows.map((row) => ({
    ...mapRow(row),
    resourceGroup: row.azure_resource_group_name,
    requestLocation: row.request_location,
    requestStatus: row.request_status
  }));
};

const updatePrivilegedRoleRequestStatus = async ({ id, status, reviewedBy, reviewNotes }) => {
  const privilegedRequestId = Number(id);
  const nextStatus = String(status || '').trim().toLowerCase();

  if (!Number.isInteger(privilegedRequestId) || privilegedRequestId <= 0) {
    throw new AppError('Request id must be a positive integer.', 400);
  }

  if (!['approved', 'rejected'].includes(nextStatus)) {
    throw new AppError('status must be approved or rejected.', 400);
  }

  const result = await db.query(
    `
      UPDATE privileged_role_requests
      SET
        status = $2,
        reviewed_by = $3,
        reviewed_at = NOW(),
        review_notes = $4
      WHERE id = $1
        AND status = 'pending'
      RETURNING *
    `,
    [privilegedRequestId, nextStatus, reviewedBy || null, reviewNotes || null]
  );

  if (!result.rows.length) {
    throw new AppError('Privileged role request not found or already reviewed.', 404);
  }

  return mapRow(result.rows[0]);
};

const reviewPrivilegedRoleRequest = async ({ id, status, reviewedBy, reviewNotes }) => {
  const updatedRequest = await updatePrivilegedRoleRequestStatus({
    id,
    status,
    reviewedBy,
    reviewNotes
  });

  let fulfillment = {
    requestId: updatedRequest.requestId,
    azureRole: updatedRequest.azureRole,
    accessApplied: false,
    rolesAssigned: 0,
    usersProcessed: 0
  };

  if (updatedRequest.status === 'approved') {
    fulfillment = await applyApprovedPrivilegedRoleRequest({
      ...updatedRequest,
      reviewedBy
    });
    updatedRequest.requestId = fulfillment.requestId || updatedRequest.requestId;
  }

  if (updatedRequest.status === 'approved') {
    await createNotification({
      type: NotificationType.PRIVILEGED_ROLE_REQUEST_REVIEWED,
      title: 'Privileged role approved',
      message: `${updatedRequest.azureRole} approved for Lab #${updatedRequest.requestId || updatedRequest.id}`,
      requestId: updatedRequest.requestId
    });
  }

  return {
    ...updatedRequest,
    ...fulfillment
  };
};

const manuallyAssignPrivilegedRole = async ({ adminEmail, requestId, azureRole }) => {
  const roleName = assertPrivilegedAzureRole(azureRole);
  const rid = Number(requestId);

  if (!Number.isInteger(rid) || rid <= 0) {
    throw new AppError('requestId must be a positive integer.', 400);
  }

  const result = await assignPrivilegedRoleToAllUsers({
    requestId: rid,
    azureRole: roleName,
    reviewedBy: adminEmail
  });

  return {
    ...result,
    message: result.accessApplied
      ? `${roleName} assigned to ${result.rolesAssigned} user(s).`
      : `${roleName} is already assigned or no provisioned users are available yet.`
  };
};

module.exports = {
  assignPrivilegedRoleToAllUsers,
  createPrivilegedRoleRequest,
  fulfillLinkedApprovedPrivilegedRoleRequests,
  linkPrivilegedRoleRequestsToRequest,
  listAssignablePrivilegedRoles,
  listPrivilegedRoleRequests,
  manuallyAssignPrivilegedRole,
  reviewPrivilegedRoleRequest
};
