const db = require('../db/postgres');
const AppError = require('../utils/AppError');
const { provisionServiceResource } = require('../provisioners/azure/serviceResourceProvisioner');
const { isPerUserCosting } = require('../utils/costingMode');
const { getStagingResourceGroups, getPerUserResourceGroupProgress } = require('./userResourceGroupService');
const { runWithConcurrency } = require('../utils/concurrency');
const {
  getServiceProvisionConcurrency,
  getServiceProvisionTimeBudgetMs,
  getCohortWaveTimeBudgetMs,
  getServicePolicyBatchSize
} = require('../utils/provisionConcurrency');
const { findInstancePolicyRule } = require('../utils/instancePolicyRules');
const { ensureCustomPolicyDefinition } = require('../provisioners/azure/customPolicyProvisioner');

const TERMINAL_STATUSES = new Set(['policy_configured', 'provisioned', 'skipped']);
const RG_OFFSET_PREFIX = 'rg_offset:';
const RG_COHORTS_PREFIX = 'rg_cohorts:';

const isNoOpPolicyService = (instance) => /ai foundry/i.test(String(instance?.service_name || ''));

const parseCompletedCohortRanges = (row) => {
  const message = String(row?.error_message || '');
  if (!message.startsWith(RG_COHORTS_PREFIX)) {
    return new Set();
  }
  return new Set(
    message
      .slice(RG_COHORTS_PREFIX.length)
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
  );
};

const cohortRangeKey = (from, to) => `${from}-${to}`;

const mergeCohortRangeMessage = (row, from, to) => {
  const set = parseCompletedCohortRanges(row);
  set.add(cohortRangeKey(from, to));
  return `${RG_COHORTS_PREFIX}${[...set].sort().join(',')}`;
};

const logEvent = (event, details = {}) => {
  console.log(
    JSON.stringify({
      event,
      service: 'service-resource-provision',
      timestamp: new Date().toISOString(),
      ...details
    })
  );
};

const upsertProvisionedResource = async (client, data) => {
  await client.query(
    `
      INSERT INTO provisioned_service_resources (
        request_id,
        service_id,
        instance_option,
        resource_type,
        resource_name,
        azure_resource_id,
        status,
        error_message,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (request_id, service_id)
      DO UPDATE SET
        instance_option = EXCLUDED.instance_option,
        resource_type = EXCLUDED.resource_type,
        resource_name = EXCLUDED.resource_name,
        azure_resource_id = EXCLUDED.azure_resource_id,
        status = EXCLUDED.status,
        error_message = EXCLUDED.error_message,
        updated_at = NOW()
    `,
    [
      data.requestId,
      data.serviceId,
      data.instanceOption,
      data.resourceType,
      data.resourceName,
      data.azureResourceId,
      data.status,
      data.errorMessage
    ]
  );
};

const parseRgOffset = (row) => {
  if (!row) {
    return 0;
  }

  if (TERMINAL_STATUSES.has(String(row.status || ''))) {
    return Number.POSITIVE_INFINITY;
  }

  const message = String(row.error_message || '');
  if (message.startsWith(RG_OFFSET_PREFIX)) {
    const parsed = Number(message.slice(RG_OFFSET_PREFIX.length));
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
  }

  return 0;
};

const getExistingServiceRows = async (requestId) => {
  const result = await db.query(
    `
      SELECT
        service_id,
        instance_option,
        resource_type,
        resource_name,
        azure_resource_id,
        status,
        error_message
      FROM provisioned_service_resources
      WHERE request_id = $1
    `,
    [requestId]
  );

  return new Map(result.rows.map((row) => [Number(row.service_id), row]));
};

const provisionPoliciesAcrossResourceGroups = async ({
  requestId,
  instance,
  resourceGroupNames,
  location
}) => {
  const results = new Array(resourceGroupNames.length);

  await runWithConcurrency(
    resourceGroupNames,
    getServiceProvisionConcurrency(),
    async (resourceGroupName, index) => {
      results[index] = await provisionServiceResource({
        requestId,
        serviceId: Number(instance.service_id),
        serviceName: instance.service_name,
        resourceGroupName,
        location,
        instanceOption: instance.instance_option
      });
    }
  );

  return results[0];
};

const persistServiceProgress = async ({
  requestId,
  instance,
  result,
  status,
  errorMessage
}) => {
  const client = await db.connect();

  try {
    await client.query('BEGIN');
    await upsertProvisionedResource(client, {
      requestId,
      serviceId: Number(instance.service_id),
      instanceOption: instance.instance_option,
      resourceType: result?.resourceType || 'Microsoft.Authorization/policyAssignments',
      resourceName: result?.resourceName || `instance-policy-${instance.service_id}`,
      azureResourceId: result?.azureResourceId || '',
      status,
      errorMessage
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Per-user labs: apply policies across RGs in bounded batches so nginx/proxy
 * timeouts do not kill multi-service × N-user fan-out in a single HTTP call.
 * Multiple incomplete services are interleaved in the same batch for parallelism.
 */
const provisionPerUserServicePoliciesInBatches = async ({
  requestId,
  instances,
  resourceGroupNames,
  location,
  existingByServiceId,
  userNumberFrom = null,
  userNumberTo = null
}) => {
  const batchSizeBase = getServicePolicyBatchSize();
  const startedAt = Date.now();
  const cohortScoped =
    Number.isInteger(Number(userNumberFrom)) && Number.isInteger(Number(userNumberTo));
  const cohortKey = cohortScoped
    ? cohortRangeKey(Number(userNumberFrom), Number(userNumberTo))
    : null;
  // Cohort waves: finish the whole wave in one POST when possible (parallel Azure calls).
  const configuredBudgetMs = getServiceProvisionTimeBudgetMs();
  const timeBudgetMs = cohortScoped
    ? configuredBudgetMs > 0
      ? configuredBudgetMs
      : getCohortWaveTimeBudgetMs()
    : configuredBudgetMs;
  const concurrency = getServiceProvisionConcurrency();

  // Warm custom policy definitions once so parallel RG assigns don't race-create them.
  const uniqueCustomKeys = new Set();
  for (const instance of instances) {
    const rule = findInstancePolicyRule(instance.service_name);
    if (rule?.customPolicyKey) {
      uniqueCustomKeys.add(rule.customPolicyKey);
    }
  }
  await runWithConcurrency(
    [...uniqueCustomKeys],
    Math.min(10, uniqueCustomKeys.size || 1),
    async (key) => {
      await ensureCustomPolicyDefinition(key);
    },
    { continueOnError: true }
  );

  const serviceState = instances.map((instance) => {
    const serviceId = Number(instance.service_id);
    const existing = existingByServiceId.get(serviceId);

    if (cohortScoped) {
      const completedRanges = parseCompletedCohortRanges(existing);
      const alreadyDoneForCohort =
        TERMINAL_STATUSES.has(String(existing?.status || '')) ||
        completedRanges.has(cohortKey);
      return {
        instance,
        serviceId,
        offset: alreadyDoneForCohort ? resourceGroupNames.length : 0,
        done: alreadyDoneForCohort
      };
    }

    const offset = parseRgOffset(existing);
    return {
      instance,
      serviceId,
      offset: Number.isFinite(offset) ? offset : resourceGroupNames.length,
      done: offset >= resourceGroupNames.length
    };
  });

  let processedBatch = false;
  let lastResultByService = new Map();

  while (
    serviceState.some((state) => !state.done) &&
    (timeBudgetMs === 0 ? !processedBatch : Date.now() - startedAt < timeBudgetMs)
  ) {
    const pendingStates = serviceState.filter((state) => !state.done);
    const remainingTasks = pendingStates.reduce(
      (sum, state) => sum + Math.max(0, resourceGroupNames.length - state.offset),
      0
    );
    const allNoOp =
      pendingStates.length > 0 && pendingStates.every((state) => isNoOpPolicyService(state.instance));
    // Cohort / no-op: take the full remaining wave in one parallel batch.
    const batchSize =
      cohortScoped || allNoOp
        ? Math.max(batchSizeBase, remainingTasks)
        : batchSizeBase;

    const tasks = [];
    const plannedOffsets = new Map();

    while (tasks.length < batchSize) {
      let added = false;

      for (const state of serviceState) {
        if (state.done || tasks.length >= batchSize) {
          continue;
        }

        const nextOffset = plannedOffsets.has(state.serviceId)
          ? plannedOffsets.get(state.serviceId)
          : state.offset;

        if (nextOffset >= resourceGroupNames.length) {
          state.done = true;
          continue;
        }

        tasks.push({
          state,
          resourceGroupName: resourceGroupNames[nextOffset],
          nextOffset: nextOffset + 1
        });
        plannedOffsets.set(state.serviceId, nextOffset + 1);
        added = true;
      }

      if (!added) {
        break;
      }
    }

    if (tasks.length === 0) {
      break;
    }

    logEvent('service_policy_batch_started', {
      requestId,
      cohortScoped,
      taskCount: tasks.length,
      concurrency,
      timeBudgetMs,
      remainingBefore: remainingTasks
    });

    await runWithConcurrency(
      tasks,
      concurrency,
      async (task) => {
        try {
          const result = await provisionServiceResource({
            requestId,
            serviceId: task.state.serviceId,
            serviceName: task.state.instance.service_name,
            resourceGroupName: task.resourceGroupName,
            location,
            instanceOption: task.state.instance.instance_option
          });
          lastResultByService.set(task.state.serviceId, result);
        } catch (error) {
          logEvent('service_policy_item_failed', {
            requestId,
            serviceId: task.state.serviceId,
            resourceGroupName: task.resourceGroupName,
            message: error?.message
          });
          lastResultByService.set(task.state.serviceId, {
            status: 'policy_configured',
            errorMessage: error?.message || 'Policy apply failed'
          });
        }
      },
      { continueOnError: true }
    );

    const offsetsAfterBatch = new Map(plannedOffsets);
    for (const state of serviceState) {
      if (!offsetsAfterBatch.has(state.serviceId)) {
        continue;
      }

      const newOffset = offsetsAfterBatch.get(state.serviceId);
      state.offset = newOffset;
      state.done = newOffset >= resourceGroupNames.length;

      const result = lastResultByService.get(state.serviceId);
      if (state.done) {
        if (cohortScoped) {
          const existing = existingByServiceId.get(state.serviceId);
          const cohortMessage = mergeCohortRangeMessage(
            existing,
            Number(userNumberFrom),
            Number(userNumberTo)
          );
          await persistServiceProgress({
            requestId,
            instance: state.instance,
            result,
            status: 'in_progress',
            errorMessage: cohortMessage
          });
          existingByServiceId.set(state.serviceId, {
            ...(existing || {}),
            status: 'in_progress',
            error_message: cohortMessage
          });
        } else {
          await persistServiceProgress({
            requestId,
            instance: state.instance,
            result,
            status: result?.status || 'policy_configured',
            errorMessage: result?.errorMessage || null
          });
        }
      } else if (!cohortScoped) {
        await persistServiceProgress({
          requestId,
          instance: state.instance,
          result,
          status: 'in_progress',
          errorMessage: `${RG_OFFSET_PREFIX}${newOffset}`
        });
      }
      // Cohort in-progress: keep prior cohort markers; resume uses relative offset in memory.
    }

    logEvent('service_policy_batch_finished', {
      requestId,
      taskCount: tasks.length,
      elapsedMs: Date.now() - startedAt,
      remainingAfter: serviceState.reduce(
        (sum, state) => sum + Math.max(0, resourceGroupNames.length - state.offset),
        0
      )
    });

    processedBatch = true;
  }

  const remainingRgWork = serviceState.reduce(
    (sum, state) => sum + Math.max(0, resourceGroupNames.length - state.offset),
    0
  );
  const configuredCount = serviceState.filter((state) => state.done).length;

  return {
    resourcesProvisioned: configuredCount,
    resourcesSkipped: 0,
    complete: remainingRgWork === 0,
    remaining: remainingRgWork,
    resourceGroupCount: resourceGroupNames.length,
    servicesTotal: instances.length
  };
};

const provisionServiceResourcesForRequest = async (requestId, options = {}) => {
  const requestResult = await db.query(
    `
      SELECT
        id,
        location,
        costing_mode,
        account_count,
        azure_resource_group_name,
        status
      FROM requests
      WHERE id = $1
    `,
    [requestId]
  );

  const request = requestResult.rows[0];

  if (!request) {
    throw new AppError('Request not found.', 404);
  }

  const accountCount = Number(request.account_count);
  const cohortFrom =
    Number.isInteger(Number(options.userNumberFrom)) && Number(options.userNumberFrom) > 0
      ? Number(options.userNumberFrom)
      : 1;
  const cohortTo =
    Number.isInteger(Number(options.userNumberTo)) && Number(options.userNumberTo) > 0
      ? Number(options.userNumberTo)
      : Number.isInteger(accountCount) && accountCount > 0
        ? accountCount
        : 1;

  const perUserProgress = await getPerUserResourceGroupProgress(requestId, db, {
    userNumberFrom: cohortFrom,
    userNumberTo: cohortTo
  });

  if (perUserProgress.required && !perUserProgress.ready) {
    return {
      resourcesProvisioned: 0,
      resourcesSkipped: 0,
      complete: false,
      remaining: perUserProgress.remaining,
      resourceGroupCount: perUserProgress.completed,
      accountCount: perUserProgress.accountCount,
      userNumberFrom: cohortFrom,
      userNumberTo: cohortTo
    };
  }

  const stagingRows = isPerUserCosting(request.costing_mode)
    ? await getStagingResourceGroups(requestId)
    : [];
  const resourceGroupNames = isPerUserCosting(request.costing_mode)
    ? stagingRows
        .filter((row) => {
          const n = Number(row.user_number);
          return n >= cohortFrom && n <= cohortTo;
        })
        .map((row) => row.azure_resource_group_name)
    : request.azure_resource_group_name
      ? [request.azure_resource_group_name]
      : [];

  if (resourceGroupNames.length === 0) {
    throw new AppError('Resource group must be created before provisioning service instances.', 400);
  }

  const instancesResult = await db.query(
    `
      SELECT
        rsi.service_id,
        rsi.instance_option,
        s.name AS service_name
      FROM request_service_instances rsi
      INNER JOIN services s ON s.id = rsi.service_id
      WHERE rsi.request_id = $1
      ORDER BY s.name
    `,
    [requestId]
  );

  const instances = instancesResult.rows;

  if (instances.length === 0) {
    return {
      resourcesProvisioned: 0,
      resourcesSkipped: 0,
      complete: true,
      remaining: 0
    };
  }

  const existingByServiceId = await getExistingServiceRows(requestId);
  const perUserCosting = isPerUserCosting(request.costing_mode);

  if (perUserCosting) {
    const batchResult = await provisionPerUserServicePoliciesInBatches({
      requestId,
      instances,
      resourceGroupNames,
      location: request.location,
      existingByServiceId,
      userNumberFrom: cohortFrom,
      userNumberTo: cohortTo
    });

    logEvent('service_resources_provision_batch', {
      requestId,
      ...batchResult,
      userNumberFrom: cohortFrom,
      userNumberTo: cohortTo
    });

    return {
      ...batchResult,
      userNumberFrom: cohortFrom,
      userNumberTo: cohortTo
    };
  }

  const existingCount = [...existingByServiceId.values()].filter((row) =>
    TERMINAL_STATUSES.has(String(row.status || ''))
  ).length;

  if (existingCount >= instances.length) {
    logEvent('service_resources_reused_existing', { requestId, count: existingCount });
    return {
      resourcesProvisioned: existingCount,
      resourcesSkipped: 0,
      complete: true,
      remaining: 0
    };
  }

  let provisioned = 0;
  let skipped = 0;
  const startedAt = Date.now();
  const timeBudgetMs = getServiceProvisionTimeBudgetMs();

  for (const instance of instances) {
    if (timeBudgetMs > 0 && Date.now() - startedAt >= timeBudgetMs) {
      break;
    }

    const serviceId = Number(instance.service_id);
    const existing = existingByServiceId.get(serviceId);
    const alreadyConfigured = TERMINAL_STATUSES.has(String(existing?.status || ''));

    if (alreadyConfigured) {
      if (existing.status === 'skipped') {
        skipped += 1;
      } else {
        provisioned += 1;
      }
      continue;
    }

    const result = await provisionPoliciesAcrossResourceGroups({
      requestId,
      instance,
      resourceGroupNames,
      location: request.location
    });

    await persistServiceProgress({
      requestId,
      instance,
      result,
      status: result.status,
      errorMessage: result.errorMessage
    });

    if (result.status === 'skipped') {
      skipped += 1;
    } else if (result.status === 'policy_configured' || result.status === 'provisioned') {
      provisioned += 1;
    }
  }

  const complete = provisioned + skipped >= instances.length;

  logEvent('service_resources_provision_completed', {
    requestId,
    provisioned,
    skipped,
    resourceGroupCount: resourceGroupNames.length,
    complete
  });

  return {
    resourcesProvisioned: provisioned,
    resourcesSkipped: skipped,
    complete,
    remaining: Math.max(0, instances.length - provisioned - skipped)
  };
};

const getProvisionedResourcesForRequest = async (requestId) => {
  const status = await getServiceProvisionStatus(requestId);
  return status.resources;
};

const getServiceProvisionStatus = async (requestId) => {
  const resourcesResult = await db.query(
    `
      SELECT
        service_id,
        instance_option,
        resource_type,
        resource_name,
        azure_resource_id,
        status,
        error_message
      FROM provisioned_service_resources
      WHERE request_id = $1
      ORDER BY service_id
    `,
    [requestId]
  );

  const resources = resourcesResult.rows;

    const [instancesResult, perUserProgress] = await Promise.all([
    db.query(
      `
        SELECT COUNT(*)::int AS count
        FROM request_service_instances
        WHERE request_id = $1
      `,
      [requestId]
    ),
    getPerUserResourceGroupProgress(requestId)
  ]);

  const expectedInstances = Number(instancesResult.rows[0]?.count || 0);
  const configuredCount = resources.filter((row) =>
    TERMINAL_STATUSES.has(String(row.status || ''))
  ).length;

  const resourceGroupsReady = !perUserProgress.required || perUserProgress.ready;

  if (perUserProgress.required && resourceGroupsReady && expectedInstances > 0) {
    const rgCount = Number(perUserProgress.accountCount || 0);
    let remainingRgWork = 0;

    for (const row of resources) {
      const offset = parseRgOffset(row);
      if (Number.isFinite(offset)) {
        remainingRgWork += Math.max(0, rgCount - offset);
      }
    }

    const missingServices = Math.max(0, expectedInstances - resources.length);
    remainingRgWork += missingServices * rgCount;

    return {
      resources,
      count: resources.length,
      complete: remainingRgWork === 0 && configuredCount >= expectedInstances,
      remaining: remainingRgWork
    };
  }

  const complete =
    resourceGroupsReady &&
    (expectedInstances === 0 ? true : configuredCount >= expectedInstances);

  return {
    resources,
    count: resources.length,
    complete,
    remaining: resourceGroupsReady
      ? Math.max(0, expectedInstances - configuredCount)
      : perUserProgress.remaining
  };
};

const repairInstancePoliciesForRequest = async (requestId) => {
  const requestResult = await db.query(
    `
      SELECT
        id,
        location,
        costing_mode,
        azure_resource_group_name
      FROM requests
      WHERE id = $1
      LIMIT 1
    `,
    [requestId]
  );

  const request = requestResult.rows[0];
  if (!request) {
    throw new AppError('Request not found.', 404);
  }

  const resourceGroupNames = isPerUserCosting(request.costing_mode)
    ? (await getStagingResourceGroups(requestId)).map((row) => row.azure_resource_group_name)
    : request.azure_resource_group_name
      ? [request.azure_resource_group_name]
      : [];

  if (resourceGroupNames.length === 0) {
    throw new AppError('No resource groups found for this request.', 400);
  }

  const instances = await db.query(
    `
      SELECT
        rsi.service_id,
        rsi.instance_option,
        s.name AS service_name
      FROM request_service_instances rsi
      INNER JOIN services s ON s.id = rsi.service_id
      WHERE rsi.request_id = $1
      ORDER BY s.name
    `,
    [requestId]
  );

  if (instances.rows.length === 0) {
    return { repaired: 0, resourceGroups: resourceGroupNames };
  }

  const repairTasks = [];

  for (const instance of instances.rows) {
    for (const resourceGroupName of resourceGroupNames) {
      repairTasks.push({
        instance,
        resourceGroupName
      });
    }
  }

  await runWithConcurrency(repairTasks, getServiceProvisionConcurrency(), async (task) => {
    await provisionServiceResource({
      requestId,
      serviceId: Number(task.instance.service_id),
      serviceName: task.instance.service_name,
      resourceGroupName: task.resourceGroupName,
      location: request.location,
      instanceOption: task.instance.instance_option
    });
  });

  logEvent('instance_policies_repaired', {
    requestId,
    repaired: repairTasks.length,
    resourceGroupCount: resourceGroupNames.length,
    instanceCount: instances.rows.length
  });

  return {
    repaired: repairTasks.length,
    resourceGroups: resourceGroupNames,
    location: request.location
  };
};

module.exports = {
  provisionServiceResourcesForRequest,
  getProvisionedResourcesForRequest,
  getServiceProvisionStatus,
  repairInstancePoliciesForRequest
};
