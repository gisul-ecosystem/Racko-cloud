const db = require('../db/postgres');
const AppError = require('../utils/AppError');
const { createNotification, NotificationType } = require('./notificationService');
const {
  createCleanupClients,
  deleteResourceGroupWithRetry,
  deleteRoleAssignmentWithRetry,
  disableAzureUserWithRetry,
  logCleanupProvisionEvent
} = require('../provisioners/azure/cleanupProvisioner');
const { deleteUserBudget } = require('../provisioners/azure/azureBudgetProvisioner');
const { getUserRoleAssignmentsForRequest } = require('./roleProvisionService');
const { getUsersForRequest } = require('./userProvisionService');
const { getResourceGroupNamesForCleanup } = require('./userResourceGroupService');

const STATUS_EXPIRED = 'Expired';
const STATUS_COMPLETED = 'Completed';
const STATUS_CLEANUP_IN_PROGRESS = 'Cleanup In Progress';
const STATUS_CLEANUP_FAILED = 'Cleanup Failed';

const logCleanup = async (requestId, operation, status) => {
  const entry = {
    timestamp: new Date().toISOString(),
    service: 'cleanup-service',
    level: status,
    event: operation,
    requestId
  };

  const logMessage = JSON.stringify(entry);

  if (status === 'failed' || status === 'error') {
    console.error(logMessage);
  } else {
    console.log(logMessage);
  }

  try {
    await db.query(
      `
        INSERT INTO cleanup_logs (
          request_id,
          operation,
          status
        )
        VALUES ($1, $2, $3)
      `,
      [requestId, operation, status]
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'cleanup-service',
        level: 'error',
        event: 'cleanup_log_write_failed',
        requestId,
        message: error?.message
      })
    );
  }
};

const validateRequestId = (requestId) => {
  if (requestId === undefined || requestId === null || String(requestId).trim() === '') {
    throw new AppError('request_id is required.', 400);
  }
};

const getCleanupRequestForUpdate = async (client, requestId) => {
  const query = `
    SELECT
      id,
      status,
      customer_email,
      location,
      azure_resource_group_name,
      costing_mode,
      expired,
      cleanup_completed,
      expiry_date
    FROM requests
    WHERE id = $1
    FOR UPDATE
  `;

  const result = await client.query(query, [requestId]);
  return result.rows[0] || null;
};

const getCleanupRequestSummary = async (requestId) => {
  const query = `
    SELECT
      id,
      status,
      azure_resource_group_name,
      expired,
      cleanup_completed
    FROM requests
    WHERE id = $1
  `;

  const result = await db.query(query, [requestId]);
  return result.rows[0] || null;
};

const getRequestsDueForCleanup = async () => {
  const query = `
    SELECT id
    FROM requests
    WHERE expiry_date <= CURRENT_DATE
      AND COALESCE(expired, false) = false
      AND COALESCE(cleanup_completed, false) = false
    ORDER BY expiry_date ASC, id ASC
  `;

  const result = await db.query(query);
  return result.rows.map((row) => row.id);
};

const markRequestExpired = async (client, requestId) => {
  const query = `
    UPDATE requests
    SET
      status = $2,
      expired = TRUE,
      cleanup_completed = TRUE,
      cleanup_enabled = FALSE,
      next_cleanup_at = NULL,
      resource_cleanup_enabled = FALSE,
      resource_cleanup_next_run_at = NULL
    WHERE id = $1
    RETURNING id, status, expired, cleanup_completed
  `;

  const result = await client.query(query, [requestId, STATUS_EXPIRED]);
  return result.rows[0];
};

const getAzureUsersWithBudgets = async (requestId) => {
  const result = await db.query(
    `
      SELECT
        id,
        azure_user_id,
        user_number,
        azure_resource_group_name,
        budget_id
      FROM azure_users
      WHERE request_id = $1
    `,
    [requestId]
  );

  return result.rows;
};

const deleteBudgetsForRequest = async (requestId) => {
  const users = await getAzureUsersWithBudgets(requestId);
  let budgetsDeleted = 0;

  for (const user of users) {
    if (!user.budget_id || !user.azure_resource_group_name) {
      continue;
    }

    try {
      await deleteUserBudget({
        resourceGroupName: user.azure_resource_group_name,
        userId: user.id
      });
      budgetsDeleted += 1;
    } catch (error) {
      logCleanupProvisionEvent('error', 'budget_delete_failed', {
        requestId,
        userId: user.id,
        message: error?.message
      });
    }
  }

  return budgetsDeleted;
};

const executeAzureResourceCleanup = async (requestId, request) => {
  const roleAssignments = await getUserRoleAssignmentsForRequest(requestId);
  const azureUsers = await getUsersForRequest(requestId);

  await logCleanup(requestId, 'cleanup_started', 'success');

  await deleteBudgetsForRequest(requestId);

  const { authorizationClient, resourceClient, graphClient } = createCleanupClients();

  let rolesRemoved = 0;
  for (const assignment of roleAssignments) {
    const removed = await deleteRoleAssignmentWithRetry(
      authorizationClient,
      assignment.scope,
      assignment.assignmentId,
      requestId
    );

    if (removed) {
      rolesRemoved += 1;
    }
  }

  await logCleanup(requestId, 'roles_removed', 'success');

  let usersDisabled = 0;
  for (const user of azureUsers) {
    const disabled = await disableAzureUserWithRetry(graphClient, user.azureUserId, requestId);
    if (disabled) {
      usersDisabled += 1;
    }
  }

  await logCleanup(requestId, 'users_disabled', 'success');

  let resourceGroupsDeleted = 0;
  const resourceGroupsToDelete = await getResourceGroupNamesForCleanup(
    requestId,
    request.costing_mode,
    request.azure_resource_group_name
  );

  for (const resourceGroupName of resourceGroupsToDelete) {
    const deleted = await deleteResourceGroupWithRetry(
      resourceClient,
      resourceGroupName,
      requestId
    );

    if (deleted) {
      resourceGroupsDeleted += 1;
    }
  }

  await logCleanup(requestId, 'resource_group_deleted', 'success');

  return {
    rolesRemoved,
    usersDisabled,
    resourceGroupsDeleted
  };
};

const resetProvisioningStateAfterScheduledCleanup = async (client, requestId) => {
  await client.query(
    `
      DELETE FROM user_role_assignments
      WHERE request_id = $1
    `,
    [requestId]
  );

  await client.query(
    `
      DELETE FROM azure_users
      WHERE request_id = $1
    `,
    [requestId]
  );

  await client.query(
    `
      DELETE FROM request_user_resource_groups
      WHERE request_id = $1
    `,
    [requestId]
  );

  await client.query(
    `
      UPDATE requests
      SET
        azure_resource_group_id = NULL,
        azure_resource_group_name = NULL,
        status = $2
      WHERE id = $1
    `,
    [requestId, STATUS_COMPLETED]
  );
};

const runScheduledCleanupForRequest = async (requestId) => {
  validateRequestId(requestId);

  const lockResult = await db.query(
    `
      UPDATE requests
      SET status = $2
      WHERE id = $1
        AND cleanup_enabled = TRUE
        AND COALESCE(expired, false) = FALSE
        AND COALESCE(cleanup_completed, false) = FALSE
        AND status = $3
        AND (
          CASE
            WHEN expires_at IS NOT NULL THEN expires_at > NOW()
            ELSE expiry_date IS NULL OR expiry_date > CURRENT_DATE
          END
        )
      RETURNING
        id,
        cleanup_interval_hours,
        customer_email
    `,
    [requestId, STATUS_CLEANUP_IN_PROGRESS, STATUS_COMPLETED]
  );

  const lockedRequest = lockResult.rows[0];

  if (!lockedRequest) {
    return null;
  }

  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const request = await getCleanupRequestForUpdate(client, requestId);

    if (!request) {
      throw new AppError('Request not found.', 404);
    }

    await client.query('COMMIT');

    logCleanupProvisionEvent('info', 'scheduled_cleanup_started', { requestId });

    const cleanupStats = await executeAzureResourceCleanup(requestId, request);

    const finalizeClient = await db.connect();

    try {
      await finalizeClient.query('BEGIN');
      await resetProvisioningStateAfterScheduledCleanup(finalizeClient, requestId);

      const now = new Date();
      const intervalHours = Number(lockedRequest.cleanup_interval_hours);
      const nextCleanup = new Date(now.getTime() + intervalHours * 60 * 60 * 1000);

      const finalizeResult = await finalizeClient.query(
        `
          UPDATE requests
          SET
            last_cleanup_at = $1,
            next_cleanup_at = $2,
            status = $3
          WHERE id = $4
            AND COALESCE(expired, false) = FALSE
            AND COALESCE(cleanup_completed, false) = FALSE
          RETURNING id
        `,
        [now.toISOString(), nextCleanup.toISOString(), STATUS_COMPLETED, requestId]
      );

      await finalizeClient.query('COMMIT');

      if (!finalizeResult.rowCount) {
        await logCleanup(requestId, 'scheduled_cleanup_skipped_after_run', 'success');
        return null;
      }

      await logCleanup(requestId, 'scheduled_cleanup_completed', 'success');

      return {
        requestId,
        customerEmail: lockedRequest.customer_email,
        intervalHours,
        cleanedAt: now,
        nextCleanupAt: nextCleanup,
        ...cleanupStats
      };
    } catch (error) {
      await finalizeClient.query('ROLLBACK');
      throw error;
    } finally {
      finalizeClient.release();
    }
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      await logCleanup(requestId, 'scheduled_cleanup_rollback_failed', 'failed');
    }

    await db.query(
      `
        UPDATE requests
        SET status = $2
        WHERE id = $1
      `,
      [requestId, STATUS_CLEANUP_FAILED]
    );

    await logCleanup(requestId, 'scheduled_cleanup_failed', 'failed');

    throw error;
  } finally {
    client.release();
  }
};

const updateCleanupSchedule = async (requestId, { cleanupEnabled, cleanupIntervalHours }) => {
  validateRequestId(requestId);

  if (typeof cleanupEnabled !== 'boolean') {
    throw new AppError('cleanupEnabled must be a boolean.', 400);
  }

  if (cleanupEnabled) {
    if (!Number.isInteger(cleanupIntervalHours) || cleanupIntervalHours < 1 || cleanupIntervalHours > 168) {
      throw new AppError('cleanupIntervalHours must be an integer between 1 and 168 when cleanup is enabled.', 400);
    }
  }

  const nextCleanupAt =
    cleanupEnabled && cleanupIntervalHours
      ? new Date(Date.now() + cleanupIntervalHours * 60 * 60 * 1000).toISOString()
      : null;

  const result = await db.query(
    `
      UPDATE requests
      SET
        cleanup_enabled = $1,
        cleanup_interval_hours = $2,
        next_cleanup_at = $3
      WHERE id = $4
      RETURNING
        id,
        cleanup_enabled,
        cleanup_interval_hours,
        next_cleanup_at,
        last_cleanup_at
    `,
    [
      cleanupEnabled,
      cleanupEnabled ? cleanupIntervalHours : null,
      nextCleanupAt,
      requestId
    ]
  );

  if (!result.rows.length) {
    throw new AppError('Request not found.', 404);
  }

  return result.rows[0];
};

const cleanupRequestById = async (requestId, trigger = 'manual') => {
  validateRequestId(requestId);

  const client = await db.connect();
  let request = null;

  try {
    await client.query('BEGIN');

    request = await getCleanupRequestForUpdate(client, requestId);

    if (!request) {
      throw new AppError('Request not found.', 404);
    }

    if (request.expired && request.cleanup_completed) {
      await client.query('COMMIT');

      await logCleanup(requestId, 'cleanup_completed', 'success');

      return {
        expired: true,
        cleanupCompleted: true,
        resourceGroup: request.azure_resource_group_name || null,
        status: request.status
      };
    }

    await client.query('COMMIT');

    const {
      rolesRemoved,
      usersDisabled,
      resourceGroupsDeleted
    } = await executeAzureResourceCleanup(requestId, request);

    await db.query(
      `
        DELETE FROM user_role_assignments
        WHERE request_id = $1
      `,
      [requestId]
    );

    await db.query(
      `
        UPDATE azure_users
        SET
          azure_account_enabled = FALSE,
          status = 'Expired',
          is_deleted = TRUE
        WHERE request_id = $1
      `,
      [requestId]
    );

    const finalizeClient = await db.connect();

    try {
      await finalizeClient.query('BEGIN');
      const updatedRequest = await markRequestExpired(finalizeClient, requestId);
      await finalizeClient.query('COMMIT');

      await logCleanup(requestId, 'cleanup_completed', 'success');

      await createNotification({
        type: NotificationType.LAB_EXPIRED,
        title: 'Lab expired',
        message: `Lab #${requestId} for ${request.customer_email || 'customer'} has expired and been cleaned up`,
        requestId
      });

      return {
        expired: updatedRequest.expired,
        cleanupCompleted: updatedRequest.cleanup_completed,
        resourceGroup: request.azure_resource_group_name || null,
        status: updatedRequest.status,
        rolesRemoved,
        usersDisabled,
        resourceGroupsDeleted
      };
    } catch (error) {
      await finalizeClient.query('ROLLBACK');
      throw error;
    } finally {
      finalizeClient.release();
    }
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      await logCleanup(requestId, 'cleanup_rollback_failed', 'failed');
    }

    await logCleanup(requestId, 'cleanup_failed', 'failed');

    throw error;
  } finally {
    client.release();
  }
};

const getCleanupStatus = async (requestId) => {
  validateRequestId(requestId);

  const request = await getCleanupRequestSummary(requestId);

  if (!request) {
    return null;
  }

  return {
    requestId: request.id,
    status: request.status,
    resourceGroup: request.azure_resource_group_name || null,
    expired: Boolean(request.expired),
    cleanupCompleted: Boolean(request.cleanup_completed)
  };
};

const cleanupExpiredRequests = async () => {
  const requestIds = await getRequestsDueForCleanup();
  const results = [];

  for (const requestId of requestIds) {
    try {
      const result = await cleanupRequestById(requestId, 'scheduler');
      results.push({ requestId, ...result, success: true });
    } catch (error) {
      results.push({
        requestId,
        success: false,
        message: error?.message
      });
    }
  }

  return results;
};

module.exports = {
  cleanupExpiredRequests,
  cleanupRequestById,
  getCleanupStatus,
  logCleanup,
  runScheduledCleanupForRequest,
  updateCleanupSchedule
};
