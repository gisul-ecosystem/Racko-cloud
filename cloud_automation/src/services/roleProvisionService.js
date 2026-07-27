const db = require('../db/postgres');
const AppError = require('../utils/AppError');
const { createGraphClient } = require('../provisioners/azure/userProvisioner');
const { batchAddUsersToGroups } = require('../provisioners/azure/graphBatchProvisioner');
const {
  buildResourceGroupScope,
  createAuthorizationClient,
  createRoleAssignmentWithRetry,
  findMatchingRoleDefinition,
  roleAssignmentIdFromSeed
} = require('../provisioners/azure/roleProvisioner');
const { isPerUserCosting } = require('../utils/costingMode');
const { getPerUserResourceGroupProgress } = require('./userResourceGroupService');
const { getDependencyRolesForServices } = require('./serviceRoleDependencyService');
const { finalizeAiFoundryTierRoles, applyTierRolesToAssignments, ensureAutoAssignRolesForServices, applyDependencyRolesToAssignments } = require('./instanceRoleMappingService');
const { ResourceManagementClient } = require('@azure/arm-resources');
const { createAzureCredential, validateAzureEnv } = require('../config/azure');
const { assignResourceScopedPermissions, RESOURCE_SCOPED_SCANNED_ROLE } = require('../provisioners/azure/resourceScopedRoleProvisioner');
const {
  getRoleProvisionConcurrency,
  getRoleProvisionBatchSize,
  getProvisionStepTimeBudgetMs,
  getResourceScopedUserBatchSize
} = require('../utils/provisionConcurrency');

// ─── Helpers ────────────────────────────────────────────────────────────────

const getRequestContext = async (client, requestId) => {
  const result = await client.query(
    `SELECT id, account_count, status, costing_mode, azure_resource_group_name
     FROM requests WHERE id = $1`,
    [requestId]
  );
  return result.rows[0] || null;
};

const getAzureUsersForRequest = async (client, requestId) => {
  const result = await client.query(
    `SELECT id, request_id, azure_user_id, username, user_number, azure_resource_group_name
     FROM azure_users
     WHERE request_id = $1 AND COALESCE(is_deleted, FALSE) = FALSE
     ORDER BY username`,
    [requestId]
  );
  return result.rows;
};

const getSelectedServicesForRequest = async (client, requestId) => {
  const result = await client.query(
    `SELECT DISTINCT rs.service_id, s.name AS service_name
     FROM request_services rs
     INNER JOIN services s ON s.id = rs.service_id
     WHERE rs.request_id = $1
     ORDER BY s.name`,
    [requestId]
  );

  return result.rows.map((row) => ({
    serviceId: Number(row.service_id),
    serviceName: row.service_name
  }));
};

const augmentRolesWithDependencies = async (client, roles, requestId) => {
  const selectedServices = await getSelectedServicesForRequest(client, requestId);
  if (selectedServices.length === 0) {
    return roles;
  }

  const serviceIdByName = new Map(selectedServices.map((s) => [s.serviceName, s.serviceId]));
  const existingRoleKeys = new Set(roles.map((r) => `${r.serviceId}:${r.azureRole.toLowerCase()}`));
  const augmented = [...roles];

  const dependencies = await getDependencyRolesForServices(
    client,
    selectedServices.map((s) => s.serviceName)
  );

  for (const dep of dependencies) {
    const serviceId = serviceIdByName.get(dep.serviceName);
    if (!serviceId) {
      continue;
    }

    const key = `${serviceId}:${dep.role.toLowerCase()}`;
    if (existingRoleKeys.has(key)) {
      continue;
    }

    existingRoleKeys.add(key);
    augmented.push({
      serviceId,
      azureRole: dep.role,
      entraGroupId: null,
      assignmentMode: 'rbac'
    });
    console.log(
      `[roleProvision] Adding dependency role "${dep.role}" for ${dep.serviceName} — ${dep.reason}`
    );
  }

  return augmented;
};

const getSelectedInstancesForRequest = async (client, requestId) => {
  const result = await client.query(
    `
      SELECT service_id, instance_option
      FROM request_service_instances
      WHERE request_id = $1
    `,
    [requestId]
  );

  return result.rows.map((row) => ({
    serviceId: Number(row.service_id),
    instanceOption: row.instance_option
  }));
};

const filterRolesByAiFoundryTier = async (client, roles, requestId, selectedServices, selectedInstances) => {
  const aiFoundry = selectedServices.find((service) => service.serviceName === 'Azure AI Foundry');
  if (!aiFoundry) {
    return roles;
  }

  const instanceOption = selectedInstances.find(
    (item) => Number(item.serviceId) === aiFoundry.serviceId
  )?.instanceOption;

  if (!instanceOption) {
    return roles;
  }

  const roleAssignments = new Map();
  roleAssignments.set(aiFoundry.serviceId, new Set());

  for (const role of roles) {
    if (Number(role.serviceId) !== aiFoundry.serviceId) {
      continue;
    }

    roleAssignments.get(aiFoundry.serviceId).add(role.azureRole);
  }

  await finalizeAiFoundryTierRoles(client, roleAssignments, [aiFoundry.serviceId], [
    { serviceId: aiFoundry.serviceId, instanceOption }
  ]);

  const allowedRoles = roleAssignments.get(aiFoundry.serviceId) || new Set();

  return roles.filter(
    (role) => Number(role.serviceId) !== aiFoundry.serviceId || allowedRoles.has(role.azureRole)
  );
};

const reconcileAiFoundryRequestServiceRoles = async (client, requestId) => {
  const selectedServices = await getSelectedServicesForRequest(client, requestId);
  const aiFoundry = selectedServices.find((service) => service.serviceName === 'Azure AI Foundry');

  if (!aiFoundry) {
    return;
  }

  const selectedInstances = await getSelectedInstancesForRequest(client, requestId);
  const instanceOption = selectedInstances.find(
    (item) => Number(item.serviceId) === aiFoundry.serviceId
  )?.instanceOption;

  if (!instanceOption) {
    return;
  }

  const roleAssignments = new Map([[aiFoundry.serviceId, new Set()]]);
  const selectedInstance = [{ serviceId: aiFoundry.serviceId, instanceOption }];

  await applyTierRolesToAssignments(client, roleAssignments, [aiFoundry.serviceId], selectedInstance);
  await ensureAutoAssignRolesForServices(client, roleAssignments, [aiFoundry.serviceId]);
  await applyDependencyRolesToAssignments(client, roleAssignments, [aiFoundry.serviceId]);
  await finalizeAiFoundryTierRoles(client, roleAssignments, [aiFoundry.serviceId], selectedInstance);

  const targetRoles = roleAssignments.get(aiFoundry.serviceId) || new Set();

  if (targetRoles.size === 0) {
    return;
  }

  await client.query(
    `
      DELETE FROM request_service_roles
      WHERE request_id = $1
        AND service_id = $2
        AND azure_role <> ALL($3::text[])
    `,
    [requestId, aiFoundry.serviceId, [...targetRoles]]
  );

  for (const azureRole of targetRoles) {
    await client.query(
      `
        INSERT INTO request_service_roles (request_id, service_id, azure_role)
        VALUES ($1, $2, $3)
        ON CONFLICT (request_id, service_id, azure_role) DO NOTHING
      `,
      [requestId, aiFoundry.serviceId, azureRole]
    );
  }
};

const backfillRequestServiceRoles = async (client, requestId, roles) => {
  for (const role of roles) {
    await client.query(
      `INSERT INTO request_service_roles (request_id, service_id, azure_role)
       VALUES ($1, $2, $3)
       ON CONFLICT (request_id, service_id, azure_role) DO NOTHING`,
      [requestId, role.serviceId, role.azureRole]
    );
  }
};
const getSelectedRolesForRequest = async (client, requestId) => {
  const result = await client.query(
    `SELECT
       rsr.service_id,
       rsr.azure_role,
       srm.entra_group_id,
       COALESCE(srm.assignment_mode, 'rbac') AS assignment_mode
     FROM request_service_roles rsr
     LEFT JOIN service_role_mapping srm
       ON srm.service_id = rsr.service_id
      AND LOWER(srm.azure_role) = LOWER(rsr.azure_role)
     WHERE rsr.request_id = $1
     ORDER BY rsr.azure_role`,
    [requestId]
  );

  return result.rows.map((row) => ({
    serviceId: Number(row.service_id),
    azureRole: row.azure_role,
    entraGroupId: row.entra_group_id,
    assignmentMode: String(row.assignment_mode || 'rbac').trim().toLowerCase()
  }));
};

// Fetch ALL existing assignments for ALL users in one query
const getAllExistingAssignments = async (client, requestId, userIds) => {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return new Map();
  }

  const result = await client.query(
    `SELECT user_id, azure_role
     FROM user_role_assignments
     WHERE request_id = $1 AND user_id = ANY($2)`,
    [requestId, userIds]
  );

  // Build a Set per user: Map<userId, Set<azureRole>>
  const map = new Map();
  for (const row of result.rows) {
    if (!map.has(row.user_id)) map.set(row.user_id, new Set());
    map.get(row.user_id).add(row.azure_role);
  }
  return map;
};

// Batch insert all assignments in one query
const batchUpsertAssignments = async (assignments) => {
  if (assignments.length === 0) return;

  const values = [];
  const placeholders = assignments.map((a, i) => {
    const base = i * 9;
    values.push(
      a.assignmentId,
      a.requestId,
      a.userId,
      a.azureRole,
      a.scope,
      a.status || 'assigned',
      a.assignedAt || new Date(),
      a.assignmentKind || 'rbac',
      a.entraGroupId || null
    );
    return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},NOW())`;
  });

  await db.query(
    `INSERT INTO user_role_assignments
       (assignment_id, request_id, user_id, azure_role, scope,
        assignment_status, assigned_at, assignment_kind, entra_group_id, created_at)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (request_id, user_id, azure_role) DO NOTHING`,
    values
  );
};

const getUserRoleAssignmentsForRequest = async (requestId) => {
  const result = await db.query(
    `SELECT
       ura.assignment_id,
       ura.azure_role,
       ura.scope,
       ura.assigned_at,
       ura.assignment_kind,
       ura.entra_group_id,
       ura.assignment_status,
       au.username,
       au.azure_user_id,
       s.name AS service_name
     FROM user_role_assignments ura
     LEFT JOIN azure_users au ON au.id = ura.user_id
     LEFT JOIN request_service_roles rsr
       ON rsr.request_id = ura.request_id AND rsr.azure_role = ura.azure_role
     LEFT JOIN services s ON s.id = rsr.service_id
     WHERE ura.request_id = $1
       AND ura.azure_role <> '__resource_scoped_scanned__'
     ORDER BY au.username, s.name, ura.azure_role`,
    [requestId]
  );

  return result.rows;
};

const getRoleProvisionStatus = async (requestId) => {
  const request = await getRequestContext(db, requestId);
  if (!request) {
    return { complete: false, remaining: 0 };
  }

  const [users, baseRoles] = await Promise.all([
    getAzureUsersForRequest(db, requestId),
    getSelectedRolesForRequest(db, requestId)
  ]);

  if (users.length === 0 || baseRoles.length === 0) {
    return { complete: false, remaining: 0 };
  }

  const existingMap = await getAllExistingAssignments(
    db,
    requestId,
    users.map((user) => user.id)
  );

  let remaining = 0;
  for (const user of users) {
    const existingRoles = existingMap.get(user.id) || new Set();
    for (const role of baseRoles) {
      if (!existingRoles.has(role.azureRole)) {
        remaining += 1;
      }
    }
  }

  const selectedServices = await getSelectedServicesForRequest(db, requestId);
  const activeResourceScopedRules = selectedServices.some((service) =>
    [
      'Azure AI Speech',
      'Azure AI Search',
      'Azure Key Vault',
      'Azure AI Foundry',
      'Azure API Management',
      'Log Analytics Workspace',
      'Azure Container Registry'
    ].includes(service.serviceName)
  );

  let resourceScopedRemaining = 0;
  if (activeResourceScopedRules) {
    for (const user of users) {
      const existingRoles = existingMap.get(user.id) || new Set();
      if (!existingRoles.has(RESOURCE_SCOPED_SCANNED_ROLE)) {
        resourceScopedRemaining += 1;
      }
    }
  }

  return {
    complete: remaining === 0 && resourceScopedRemaining === 0,
    remaining: remaining + resourceScopedRemaining
  };
};

// ─── Main ───────────────────────────────────────────────────────────────────

const CONCURRENCY_LIMIT = getRoleProvisionConcurrency();

const runConcurrent = async (tasks, limit) => {
  const results = [];
  const executing = new Set();

  for (const task of tasks) {
    const p = Promise.resolve().then(() => task()).then((r) => {
      executing.delete(p);
      return r;
    });
    executing.add(p);
    results.push(p);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  return Promise.allSettled(results);
};

const resolveUserResourceGroupName = (request, user) => {
  if (isPerUserCosting(request.costing_mode)) {
    return user.azure_resource_group_name;
  }

  return request.azure_resource_group_name;
};

const findLinkedContainerRegistry = async (resourceGroupName) => {
  try {
    const azureConfig = validateAzureEnv();
    const credential = createAzureCredential(azureConfig);
    const resourceClient = new ResourceManagementClient(credential, azureConfig.subscriptionId);

    for await (const resource of resourceClient.resources.listByResourceGroup(resourceGroupName, {
      filter: "resourceType eq 'Microsoft.ContainerRegistry/registries'"
    })) {
      return resource.id;
    }

    return null;
  } catch (err) {
    console.warn('[roleProvision] Could not find linked ACR:', err.message);
    return null;
  }
};

const assignAcrPullAtRegistryScope = async ({
  authorizationClient,
  users,
  request,
  requestId,
  existingMap,
  pendingDbInserts
}) => {
  const acrTasks = [];

  for (const user of users) {
    const resourceGroupName = resolveUserResourceGroupName(request, user);
    if (!resourceGroupName) {
      continue;
    }

    const existingRoles = existingMap.get(user.id) || new Set();
    if (existingRoles.has('AcrPull')) {
      continue;
    }

    acrTasks.push(async () => {
      const acrScope = await findLinkedContainerRegistry(resourceGroupName);
      if (!acrScope) {
        console.warn(
          `[roleProvision] No linked ACR in ${resourceGroupName} — skipping AcrPull for user ${user.username}`
        );
        return null;
      }

      const definition = await findMatchingRoleDefinition(authorizationClient, acrScope, 'AcrPull');
      if (!definition) {
        console.warn(`[roleProvision] AcrPull role definition not found at scope ${acrScope}`);
        return null;
      }

      const assignmentId = roleAssignmentIdFromSeed(`${requestId}-${user.id}-${definition.id}-acr`);

      try {
        await createRoleAssignmentWithRetry(
          authorizationClient,
          acrScope,
          assignmentId,
          {
            principalId: user.azure_user_id,
            roleDefinitionId: definition.id,
            principalType: 'User'
          },
          requestId
        );
      } catch (error) {
        if (error?.statusCode !== 409 && error?.code !== 'RoleAssignmentExists') {
          throw error;
        }
      }

      return {
        assignmentId,
        requestId,
        userId: user.id,
        azureRole: 'AcrPull',
        scope: acrScope,
        status: 'assigned',
        assignedAt: new Date(),
        assignmentKind: 'rbac',
        entraGroupId: null
      };
    });
  }

  const acrResults = await runConcurrent(acrTasks, CONCURRENCY_LIMIT);
  for (const result of acrResults) {
    if (result.status === 'fulfilled' && result.value) {
      pendingDbInserts.push(result.value);
    }
  }
};

const provisionRolesForRequest = async (requestId) => {
  try {
    const request = await getRequestContext(db, requestId);
    if (!request) throw new AppError('Request not found', 404);

    const perUserProgress = await getPerUserResourceGroupProgress(requestId);

    if (perUserProgress.required && !perUserProgress.ready) {
      return {
        success: true,
        complete: false,
        remaining: perUserProgress.remaining,
        usersProcessed: 0,
        rolesAssigned: 0
      };
    }

    const [users, baseRoles, selectedServices, selectedInstances] = await Promise.all([
      getAzureUsersForRequest(db, requestId),
      getSelectedRolesForRequest(db, requestId),
      getSelectedServicesForRequest(db, requestId),
      getSelectedInstancesForRequest(db, requestId)
    ]);

    const accountCount = Number(request.account_count);

    if (
      perUserProgress.required &&
      Number.isInteger(accountCount) &&
      accountCount > 0 &&
      users.length < accountCount
    ) {
      return {
        success: true,
        complete: false,
        remaining: accountCount - users.length,
        usersProcessed: users.length,
        rolesAssigned: 0
      };
    }

    let roles = await augmentRolesWithDependencies(db, baseRoles, requestId);
    roles = await filterRolesByAiFoundryTier(db, roles, requestId, selectedServices, selectedInstances);
    await backfillRequestServiceRoles(db, requestId, roles);

    const hasAiFoundry = selectedServices.some((service) => service.serviceName === 'Azure AI Foundry');
    const hasStandaloneAcr = selectedServices.some(
      (service) => service.serviceName === 'Azure Container Registry'
    );
    const includesAcrPull = roles.some((role) => role.azureRole === 'AcrPull');
    const rolesForResourceGroup = roles.filter((role) => {
      if (hasAiFoundry && role.azureRole === 'AcrPull') {
        return false;
      }

      if (hasStandaloneAcr && (role.azureRole === 'AcrPull' || role.azureRole === 'AcrPush')) {
        return false;
      }

      return true;
    });

    if (users.length === 0 || roles.length === 0) {
      return {
        success: true,
        complete: true,
        remaining: 0,
        usersProcessed: users.length,
        rolesAssigned: 0
      };
    }

    const { authorizationClient, subscriptionId } = createAuthorizationClient();
    const { graphClient } = createGraphClient();

    if (!isPerUserCosting(request.costing_mode) && !request.azure_resource_group_name) {
      throw new AppError('Resource group must be provisioned before assigning roles.', 400);
    }

    const defaultScope = !isPerUserCosting(request.costing_mode)
      ? buildResourceGroupScope(subscriptionId, request.azure_resource_group_name)
      : null;

    // 1. Fetch ALL existing assignments in one DB round-trip
    const userIds = users.map((u) => u.id);
    const existingMap = await getAllExistingAssignments(db, requestId, userIds);

    // 2. Pre-fetch all unique role definitions in parallel (cached)
    const rbacRoles = rolesForResourceGroup.filter((r) => r.assignmentMode !== 'group' || !r.entraGroupId);
    const uniqueRoleNames = [...new Set(rbacRoles.map((r) => r.azureRole))];

    const roleDefMap = new Map();
    const scopeCache = new Map();

    const resolveScopeForUser = async (user) => {
      if (!isPerUserCosting(request.costing_mode)) {
        return defaultScope;
      }

      const resourceGroupName = resolveUserResourceGroupName(request, user);
      if (!resourceGroupName) {
        throw new AppError(`Resource group is missing for user ${user.username}.`, 400);
      }

      if (!scopeCache.has(resourceGroupName)) {
        const scope = buildResourceGroupScope(subscriptionId, resourceGroupName);
        scopeCache.set(resourceGroupName, scope);

        await Promise.all(
          uniqueRoleNames.map(async (roleName) => {
            const cacheKey = `${resourceGroupName}:${roleName}`;
            if (!roleDefMap.has(cacheKey)) {
              const def = await findMatchingRoleDefinition(authorizationClient, scope, roleName);
              if (def) roleDefMap.set(cacheKey, def);
            }
          })
        );
      }

      return scopeCache.get(resourceGroupName);
    };

    if (!isPerUserCosting(request.costing_mode)) {
      await Promise.all(
        uniqueRoleNames.map(async (roleName) => {
          const def = await findMatchingRoleDefinition(authorizationClient, defaultScope, roleName);
          if (def) roleDefMap.set(roleName, def);
        })
      );
    }

    // 3. Build all RBAC tasks and group assignments
    const rbacTasks = [];
    const groupAssignments = new Map();
    const groupDbInserts = [];

    for (const user of users) {
      const existingRoles = existingMap.get(user.id) || new Set();
      const scope = await resolveScopeForUser(user);

      for (const role of rolesForResourceGroup) {
        if (existingRoles.has(role.azureRole)) continue;

        if (role.assignmentMode === 'group' && role.entraGroupId) {
          if (!groupAssignments.has(role.entraGroupId)) {
            groupAssignments.set(role.entraGroupId, []);
          }
          groupAssignments.get(role.entraGroupId).push(user);

          groupDbInserts.push({
            assignmentId: roleAssignmentIdFromSeed(
              `${requestId}-${user.id}-${role.azureRole}-${role.entraGroupId}`
            ),
            requestId,
            userId: user.id,
            azureRole: role.azureRole,
            scope,
            status: 'assigned',
            assignedAt: new Date(),
            assignmentKind: 'group',
            entraGroupId: role.entraGroupId
          });
          continue;
        }

        const definition = isPerUserCosting(request.costing_mode)
          ? roleDefMap.get(`${resolveUserResourceGroupName(request, user)}:${role.azureRole}`)
          : roleDefMap.get(role.azureRole);
        if (!definition) continue;

        const assignmentId = roleAssignmentIdFromSeed(`${requestId}-${user.id}-${definition.id}`);

        rbacTasks.push(async () => {
          try {
            await createRoleAssignmentWithRetry(
              authorizationClient,
              scope,
              assignmentId,
              {
                principalId: user.azure_user_id,
                roleDefinitionId: definition.id,
                principalType: 'User'
              },
              requestId
            );
          } catch (error) {
            if (error?.statusCode !== 409 && error?.code !== 'RoleAssignmentExists') {
              throw error;
            }
          }

          return {
            assignmentId,
            requestId,
            userId: user.id,
            azureRole: role.azureRole,
            scope,
            status: 'assigned',
            assignedAt: new Date(),
            assignmentKind: 'rbac',
            entraGroupId: null
          };
        });
      }
    }

    if (groupDbInserts.length > 0) {
      await batchUpsertAssignments(groupDbInserts);
    }

    const startedAt = Date.now();
    const timeBudgetMs = getProvisionStepTimeBudgetMs();
    const batchSize = getRoleProvisionBatchSize();
    let batchAssigned = 0;
    const pendingDbInserts = [...groupDbInserts];

    // With no time budget: one HTTP request = one RBAC batch (proxy-safe for large labs).
    // With a time budget: keep assigning until the budget expires, then return complete:false.
    let processedBatch = false;
    while (
      rbacTasks.length > 0 &&
      (timeBudgetMs === 0 ? !processedBatch : Date.now() - startedAt < timeBudgetMs)
    ) {
      const batch = rbacTasks.splice(0, batchSize);
      const rbacResults = await runConcurrent(batch, CONCURRENCY_LIMIT);

      const batchInserts = [];
      for (const result of rbacResults) {
        if (result.status === 'fulfilled' && result.value) {
          batchInserts.push(result.value);
        } else if (result.status === 'rejected') {
          throw result.reason;
        }
      }

      if (batchInserts.length > 0) {
        await batchUpsertAssignments(batchInserts);
        pendingDbInserts.push(...batchInserts);
        batchAssigned += batchInserts.length;
      }

      processedBatch = true;
    }

    const rbacComplete = rbacTasks.length === 0;

    if (!rbacComplete) {
      return {
        success: true,
        complete: false,
        remaining: rbacTasks.length,
        usersProcessed: users.length,
        rolesAssigned: batchAssigned,
        successful: pendingDbInserts.length,
        rolesProvisioned: [...new Set(roles.map((r) => r.azureRole))],
        hasAiFoundry,
        permissionsComplete: false,
        provisioningStatus: 'provisioning_roles',
        resourceScopedAssignments: 0,
        permissionFailures: []
      };
    }

    if (hasAiFoundry && includesAcrPull) {
      const alreadyScanningResourceScoped = users.some((user) => {
        const existingRoles = existingMap.get(user.id);
        return existingRoles && existingRoles.has(RESOURCE_SCOPED_SCANNED_ROLE);
      });

      if (!alreadyScanningResourceScoped) {
        try {
          await assignAcrPullAtRegistryScope({
            authorizationClient,
            users,
            request,
            requestId,
            existingMap,
            pendingDbInserts
          });
        } catch (err) {
          console.warn('[roleProvision] AcrPull assignment failed — continuing:', err.message);
        }
      }
    }

    let resourcePermissionResult = {
      assignments: [],
      failures: [],
      permissionsComplete: true,
      resourcesProcessed: 0,
      usersProcessed: 0,
      usersRemaining: 0
    };

    try {
      resourcePermissionResult = await assignResourceScopedPermissions({
        authorizationClient,
        users,
        request,
        requestId,
        selectedServices,
        resolveUserResourceGroupName,
        existingRoleMap: existingMap,
        batchSize: getResourceScopedUserBatchSize()
      });
      pendingDbInserts.push(...resourcePermissionResult.assignments);
    } catch (err) {
      console.error('[roleProvision] Resource-scoped permission assignment failed:', err.message);
      resourcePermissionResult = {
        assignments: [],
        failures: [{ message: err.message || 'Resource-scoped permission assignment failed' }],
        permissionsComplete: false,
        resourcesProcessed: 0,
        usersProcessed: 0,
        usersRemaining: users.length
      };
    }

    if (resourcePermissionResult.assignments.length > 0) {
      await batchUpsertAssignments(resourcePermissionResult.assignments);
      pendingDbInserts.push(...resourcePermissionResult.assignments);
    }

    if (resourcePermissionResult.usersRemaining > 0) {
      return {
        success: true,
        complete: false,
        remaining: resourcePermissionResult.usersRemaining,
        usersProcessed: users.length,
        rolesAssigned: pendingDbInserts.length,
        successful: pendingDbInserts.length,
        rolesProvisioned: [...new Set(roles.map((r) => r.azureRole))],
        hasAiFoundry,
        permissionsComplete: false,
        provisioningStatus: 'provisioning_resource_permissions',
        resourceScopedAssignments: resourcePermissionResult.resourcesProcessed,
        permissionFailures: resourcePermissionResult.failures
      };
    }

    // Batch group memberships in parallel
    await Promise.all(
      [...groupAssignments.entries()].map(([groupId, members]) =>
        batchAddUsersToGroups(graphClient, groupId, members, `request-${requestId}-group-${groupId}`)
      )
    );

    const permissionsComplete = resourcePermissionResult.permissionsComplete;

    if (permissionsComplete && request.customer_email) {
      try {
        const privilegedRoleRequestService = require('./privilegedRoleRequestService');
        await privilegedRoleRequestService.fulfillLinkedApprovedPrivilegedRoleRequests({
          customerEmail: request.customer_email,
          requestId
        });
      } catch (fulfillmentError) {
        console.error(
          `[roleProvision] Approved privileged role fulfillment failed for request ${requestId}:`,
          fulfillmentError?.message
        );
      }
    }

    return {
      success: permissionsComplete,
      complete: permissionsComplete,
      remaining: 0,
      usersProcessed: users.length,
      rolesAssigned: pendingDbInserts.length,
      successful: pendingDbInserts.length,
      rolesProvisioned: [...new Set(roles.map((r) => r.azureRole))],
      hasAiFoundry,
      permissionsComplete,
      provisioningStatus: permissionsComplete ? 'provisioned' : 'provisioned_permissions_incomplete',
      resourceScopedAssignments: resourcePermissionResult.resourcesProcessed,
      permissionFailures: resourcePermissionResult.failures
    };
  } catch (error) {
    throw error;
  }
};

const reprovisionRolesForRequest = async (requestId) => {
  console.log(`[reprovisionRoles] Re-provisioning roles for request ${requestId}`);
  await reconcileAiFoundryRequestServiceRoles(db, requestId);
  return provisionRolesForRequest(requestId);
};

const repairResourceScopedPermissionsForRequest = async (requestId) => {
  const request = await getRequestContext(db, requestId);
  if (!request) {
    throw new AppError('Request not found', 404);
  }

  const [users, selectedServices] = await Promise.all([
    getAzureUsersForRequest(db, requestId),
    getSelectedServicesForRequest(db, requestId)
  ]);

  if (users.length === 0) {
    return {
      success: true,
      usersProcessed: 0,
      permissionsComplete: true,
      provisioningStatus: 'provisioned',
      resourceScopedAssignments: 0,
      permissionFailures: []
    };
  }

  const { authorizationClient } = createAuthorizationClient();
  const existingMap = await getAllExistingAssignments(
    db,
    requestId,
    users.map((user) => user.id)
  );
  const result = await assignResourceScopedPermissions({
    authorizationClient,
    users,
    request,
    requestId,
    selectedServices,
    resolveUserResourceGroupName,
    existingRoleMap: existingMap,
    batchSize: getResourceScopedUserBatchSize()
  });

  if (result.assignments.length > 0) {
    await batchUpsertAssignments(result.assignments);
  }

  const permissionsComplete = result.usersRemaining === 0 && result.permissionsComplete;

  return {
    success: permissionsComplete,
    complete: permissionsComplete,
    remaining: result.usersRemaining || 0,
    usersProcessed: users.length,
    permissionsComplete,
    provisioningStatus: permissionsComplete ? 'provisioned' : 'provisioning_resource_permissions',
    resourceScopedAssignments: result.resourcesProcessed,
    permissionFailures: result.failures
  };
};

module.exports = {
  getUserRoleAssignmentsForRequest,
  getRoleProvisionStatus,
  provisionRolesForRequest,
  reprovisionRolesForRequest,
  repairResourceScopedPermissionsForRequest
};
