const db = require('../db/postgres');
const AppError = require('../utils/AppError');
const { createNotification, NotificationType } = require('./notificationService');
const { provisionResourceGroup, preflightAzureManagementAccess } = require('../provisioners/azure/resourceGroupProvisioner');
const { assertProvisionableLocation } = require('./azureLocationService');
const {
  buildSharedResourceGroupName,
  isPerUserCosting,
  isSharedCosting
} = require('../utils/costingMode');
const {
  getStagingResourceGroups,
  provisionPerUserResourceGroups,
  summarizePerUserResourceGroups
} = require('./userResourceGroupService');
const {
  getMaxProvisionAccountCount,
  getProvisionStepTimeBudgetMs
} = require('../utils/provisionConcurrency');

const STATUS_COMPLETED = 'Completed';

const logProvisionEvent = (level, event, details = {}) => {
  const entry = {
    timestamp: new Date().toISOString(),
    service: 'request-provisioning',
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

const getRequestForProvisioning = async (client, requestId) => {
  const query = `
    SELECT
      id,
      status,
      location,
      account_count,
      costing_mode,
      azure_resource_group_id,
      azure_resource_group_name
    FROM requests
    WHERE id = $1
    FOR UPDATE
  `;

  const result = await client.query(query, [requestId]);
  return result.rows[0] || null;
};

const updateProvisionedRequest = async (client, requestId, resourceGroupId, resourceGroupName) => {
  const query = `
    UPDATE requests
    SET
      azure_resource_group_id = $1,
      azure_resource_group_name = $2,
      status = $3
    WHERE id = $4
    RETURNING id, status, azure_resource_group_id, azure_resource_group_name, costing_mode
  `;

  const result = await client.query(query, [
    resourceGroupId,
    resourceGroupName,
    STATUS_COMPLETED,
    requestId
  ]);

  return result.rows[0];
};

const markPerUserProvisioningComplete = async (client, requestId) => {
  const query = `
    UPDATE requests
    SET status = $2
    WHERE id = $1
    RETURNING id, status, costing_mode
  `;

  const result = await client.query(query, [requestId, STATUS_COMPLETED]);
  return result.rows[0];
};

const getProvisionedRequest = async (requestId) => {
  const query = `
    SELECT
      id,
      status,
      costing_mode,
      account_count,
      azure_resource_group_id,
      azure_resource_group_name
    FROM requests
    WHERE id = $1
  `;

  const result = await db.query(query, [requestId]);

  if (result.rows.length === 0) {
    return null;
  }

  const request = result.rows[0];

  if (isPerUserCosting(request.costing_mode)) {
    const resourceGroups = await getStagingResourceGroups(requestId);
    const accountCount = Number(request.account_count) || 0;

    return {
      id: request.id,
      status: request.status,
      costingMode: request.costing_mode,
      accountCount,
      resourceGroupCount: resourceGroups.length,
      complete: accountCount > 0 && resourceGroups.length >= accountCount,
      resourceGroup: summarizePerUserResourceGroups(resourceGroups),
      resourceGroups: resourceGroups.map((row) => ({
        userNumber: Number(row.user_number),
        name: row.azure_resource_group_name,
        id: row.azure_resource_group_id
      }))
    };
  }

  return {
    id: request.id,
    status: request.status,
    costingMode: request.costing_mode,
    accountCount: Number(request.account_count) || 0,
    resourceGroupCount: request.azure_resource_group_name ? 1 : 0,
    complete: Boolean(request.azure_resource_group_name),
    resourceGroup: request.azure_resource_group_name || null,
    resourceGroupId: request.azure_resource_group_id || null
  };
};

const provisionSharedResourceGroup = async (client, request) => {
  if (request.azure_resource_group_name) {
    await client.query('COMMIT');

    logProvisionEvent('info', 'provision_request_reused_existing', {
      requestId: request.id,
      status: request.status,
      resourceGroup: request.azure_resource_group_name,
      costingMode: request.costing_mode
    });

    return {
      resourceGroup: request.azure_resource_group_name,
      resourceGroupCount: 1,
      accountCount: Number(request.account_count) || 0,
      costingMode: request.costing_mode,
      complete: true,
      remaining: 0,
      batchCreated: 0,
      failures: [],
      failed: false
    };
  }

  const resourceGroupName = buildSharedResourceGroupName(request.id);
  const location = request.location.trim();
  assertProvisionableLocation(location);

  logProvisionEvent('info', 'provision_request_started', {
    requestId: request.id,
    status: request.status,
    resourceGroupName,
    location,
    costingMode: request.costing_mode
  });

  await preflightAzureManagementAccess({ requestId: request.id });

  const provisionedResourceGroup = await provisionResourceGroup({
    requestId: request.id,
    resourceGroupName,
    location
  });

  await updateProvisionedRequest(
    client,
    request.id,
    provisionedResourceGroup.resourceGroupId,
    provisionedResourceGroup.resourceGroupName
  );

  await client.query('COMMIT');

  logProvisionEvent('info', 'provision_request_completed', {
    requestId: request.id,
    resourceGroupName: provisionedResourceGroup.resourceGroupName,
    resourceGroupId: provisionedResourceGroup.resourceGroupId,
    costingMode: request.costing_mode
  });

  return {
    resourceGroup: provisionedResourceGroup.resourceGroupName,
    resourceGroupCount: 1,
    accountCount: Number(request.account_count) || 0,
    costingMode: request.costing_mode,
    complete: true,
    remaining: 0,
    batchCreated: 1,
    failures: [],
    failed: false
  };
};

const provisionPerUserResourceGroupsForRequest = async (
  request,
  { userNumberFrom = null, userNumberTo = null } = {}
) => {
  const accountCount = Number(request.account_count);
  const maxAccountCount = getMaxProvisionAccountCount();

  if (!Number.isInteger(accountCount) || accountCount <= 0) {
    throw new AppError('Request account count is invalid.', 400);
  }

  if (accountCount > maxAccountCount) {
    throw new AppError(
      `Account count exceeds the maximum supported limit of ${maxAccountCount}.`,
      400
    );
  }

  const rangeFrom =
    Number.isInteger(Number(userNumberFrom)) && Number(userNumberFrom) > 0
      ? Number(userNumberFrom)
      : 1;
  const rangeTo =
    Number.isInteger(Number(userNumberTo)) && Number(userNumberTo) > 0
      ? Number(userNumberTo)
      : accountCount;

  const existingGroups = await getStagingResourceGroups(request.id);
  const existingInRange = existingGroups.filter((row) => {
    const n = Number(row.user_number);
    return n >= rangeFrom && n <= rangeTo;
  });
  const targetCount = rangeTo - rangeFrom + 1;

  if (existingInRange.length >= targetCount) {
    // Only mark request Completed when ALL users have RGs (all cohorts done for this step).
    if (existingGroups.length >= accountCount) {
      await db.query(
        `
          UPDATE requests
          SET status = $2
          WHERE id = $1
        `,
        [request.id, STATUS_COMPLETED]
      );
    }

    logProvisionEvent('info', 'provision_request_reused_existing', {
      requestId: request.id,
      status: request.status,
      resourceGroupCount: existingInRange.length,
      costingMode: request.costing_mode,
      userNumberFrom: rangeFrom,
      userNumberTo: rangeTo
    });

    return {
      resourceGroup: summarizePerUserResourceGroups(existingGroups),
      resourceGroupCount: existingInRange.length,
      accountCount: targetCount,
      complete: true,
      remaining: 0,
      failures: []
    };
  }

  const location = request.location.trim();
  assertProvisionableLocation(location);

  logProvisionEvent('info', 'provision_request_started', {
    requestId: request.id,
    status: request.status,
    accountCount,
    existingResourceGroupCount: existingInRange.length,
    location,
    costingMode: request.costing_mode,
    userNumberFrom: rangeFrom,
    userNumberTo: rangeTo
  });

  await preflightAzureManagementAccess({ requestId: request.id });

  const startedAt = Date.now();
  const timeBudgetMs = getProvisionStepTimeBudgetMs();
  let progress = {
    completed: existingInRange.length,
    remaining: Math.max(0, targetCount - existingInRange.length),
    done: false,
    batchCreated: 0,
    failures: [],
    rows: existingGroups
  };

  while (!progress.done) {
    progress = await provisionPerUserResourceGroups({
      requestId: request.id,
      accountCount,
      location,
      userNumberFrom: rangeFrom,
      userNumberTo: rangeTo
    });

    // No time budget: one resource-group batch per HTTP request (proxy-safe).
    if (timeBudgetMs === 0) {
      break;
    }

    if (Date.now() - startedAt >= timeBudgetMs) {
      break;
    }
  }

  if (!progress.done) {
    const failures = progress.failures || [];
    const zeroProgressFailure =
      Number(progress.batchCreated || 0) === 0 && failures.length > 0;

    logProvisionEvent(zeroProgressFailure ? 'error' : 'info', 'provision_request_partial', {
      requestId: request.id,
      resourceGroupCount: progress.completed,
      accountCount: targetCount,
      remaining: progress.remaining,
      batchCreated: progress.batchCreated,
      failures: failures.length,
      failed: zeroProgressFailure
    });

    return {
      resourceGroup: summarizePerUserResourceGroups(progress.rows),
      resourceGroupCount: progress.completed,
      accountCount: targetCount,
      complete: false,
      remaining: progress.remaining,
      batchCreated: progress.batchCreated || 0,
      failures,
      // Zero-progress batch with errors is terminal until explicit Retry.
      failed: zeroProgressFailure
    };
  }

  const allGroups = await getStagingResourceGroups(request.id);
  if (allGroups.length >= accountCount) {
    await db.query(
      `
        UPDATE requests
        SET status = $2
        WHERE id = $1
      `,
      [request.id, STATUS_COMPLETED]
    );
  }

  logProvisionEvent('info', 'provision_request_completed', {
    requestId: request.id,
    resourceGroupCount: progress.completed,
    costingMode: request.costing_mode,
    userNumberFrom: rangeFrom,
    userNumberTo: rangeTo
  });

  return {
    resourceGroup: summarizePerUserResourceGroups(progress.rows),
    resourceGroupCount: progress.completed,
    accountCount: targetCount,
    complete: true,
    remaining: 0,
    failures: progress.failures || []
  };
};

const provisionRequestResourceGroup = async (requestId, options = {}) => {
  const {
    resolveActiveCohort,
    advanceCohortAfterStep,
    withCohortMeta,
    markCohortFailed
  } = require('./provisionCohortService');

  const requestResult = await db.query(
    `
      SELECT
        id,
        status,
        location,
        account_count,
        costing_mode,
        azure_resource_group_id,
        azure_resource_group_name
      FROM requests
      WHERE id = $1
    `,
    [requestId]
  );

  const request = requestResult.rows[0];
  let cohort = null;
  const reviveFailed = options.retry === true;

  try {
    if (!request) {
      throw new AppError('Request not found.', 404);
    }

    if (typeof request.location !== 'string' || request.location.trim().length === 0) {
      throw new AppError('Request location is missing.', 400);
    }

    if (isPerUserCosting(request.costing_mode)) {
      try {
        cohort = await resolveActiveCohort(requestId, {
          reviveFailed,
          claimPending: true
        });
      } catch {
        cohort = null;
      }

      if (cohort && cohort.status === 'failed' && !cohort.allComplete) {
        return withCohortMeta(
          {
            resourceGroup: null,
            resourceGroupCount: 0,
            accountCount: Number(request.account_count) || 0,
            complete: false,
            remaining: Math.max(
              0,
              Number(cohort.userNumberTo) - Number(cohort.userNumberFrom) + 1
            ),
            batchCreated: 0,
            failures: [
              {
                message:
                  cohort.lastError ||
                  'Resource group step failed. Retry after fixing the Azure error.'
              }
            ],
            failed: true
          },
          cohort
        );
      }

      const range =
        cohort && !cohort.allComplete
          ? {
              userNumberFrom: options.userNumberFrom ?? cohort.userNumberFrom,
              userNumberTo: options.userNumberTo ?? cohort.userNumberTo
            }
          : {
              userNumberFrom: options.userNumberFrom ?? null,
              userNumberTo: options.userNumberTo ?? null
            };

      const result = await provisionPerUserResourceGroupsForRequest(request, range);

      if (result.complete && cohort && !cohort.allComplete) {
        await advanceCohortAfterStep(requestId, 'resourceGroup');
        cohort = await resolveActiveCohort(requestId, { claimPending: false });
      } else if ((!result.complete && result.failures?.length && cohort) || result.failed) {
        const failureMessage =
          result.failures?.[0]?.message ||
          'Unable to create Azure resource groups for this wave.';
        await markCohortFailed(cohort.id, failureMessage);
        cohort = {
          ...cohort,
          status: 'failed',
          lastError: failureMessage
        };
      }

      return withCohortMeta(result, cohort);
    }

    const client = await db.connect();

    try {
      await client.query('BEGIN');
      const lockedRequest = await getRequestForProvisioning(client, requestId);

      if (!lockedRequest) {
        throw new AppError('Request not found.', 404);
      }

      if (isSharedCosting(lockedRequest.costing_mode)) {
        return provisionSharedResourceGroup(client, lockedRequest);
      }

      throw new AppError('Request costing mode is invalid.', 400);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {

    logProvisionEvent('error', 'provision_request_failed', {
      requestId,
      errorName: error?.name,
      errorCode: error?.code,
      statusCode: error?.statusCode || error?.status,
      message: error?.message
    });

    const failedRequestResult = await db.query(
      `SELECT id, customer_email FROM requests WHERE id = $1 LIMIT 1`,
      [requestId]
    );
    const failedRequest = failedRequestResult.rows[0];

    await createNotification({
      type: NotificationType.PROVISIONING_FAILED,
      title: 'Lab provisioning failed',
      message: `Lab #${requestId}${failedRequest?.customer_email ? ` for ${failedRequest.customer_email}` : ''} failed: ${error.message}`,
      requestId: Number(requestId) || null
    });

    throw error;
  }
};

module.exports = {
  getProvisionedRequest,
  provisionRequestResourceGroup
};
