const { ResourceManagementClient } = require('@azure/arm-resources');
const db = require('../db/postgres');
const { createAzureCredential, validateAzureEnv } = require('../config/azure');
const { filterResourcesForUser, expandDeploymentResources } = require('../utils/resourceOwnership');

let armClient = null;

const getArmClient = () => {
  if (armClient) {
    return armClient;
  }

  const azureConfig = validateAzureEnv();
  const credential = createAzureCredential(azureConfig);
  armClient = new ResourceManagementClient(credential, azureConfig.subscriptionId);
  return armClient;
};

// Wrong API version = silent failure on delete
const API_VERSIONS = {
  'microsoft.compute/virtualmachines': '2023-07-01',
  'microsoft.compute/disks': '2023-04-02',
  'microsoft.compute/snapshots': '2023-07-03',
  'microsoft.compute/images': '2023-07-01',
  'microsoft.compute/sshpublickeys': '2022-11-01',
  'microsoft.storage/storageaccounts': '2023-01-01',
  'microsoft.sql/servers': '2022-05-01-preview',
  'microsoft.sql/servers/databases': '2022-05-01-preview',
  'microsoft.dbformysql/servers': '2022-01-01',
  'microsoft.dbforpostgresql/servers': '2022-12-01',
  'microsoft.network/virtualnetworks': '2023-05-01',
  'microsoft.network/networkinterfaces': '2023-05-01',
  'microsoft.network/publicipaddresses': '2023-05-01',
  'microsoft.network/networksecuritygroups': '2023-05-01',
  'microsoft.network/loadbalancers': '2023-05-01',
  'microsoft.network/applicationgateways': '2023-05-01',
  'microsoft.network/natgateways': '2023-05-01',
  'microsoft.containerservice/managedclusters': '2023-07-01',
  'microsoft.web/sites': '2022-09-01',
  'microsoft.web/serverfarms': '2022-09-01',
  'microsoft.keyvault/vaults': '2023-02-01',
  'microsoft.cache/redis': '2023-04-01',
  'microsoft.servicebus/namespaces': '2022-10-01-preview',
  'microsoft.eventhub/namespaces': '2022-10-01-preview',
  'microsoft.cognitiveservices/accounts': '2023-05-01',
  'microsoft.containerregistry/registries': '2023-06-01-preview',
  'microsoft.documentdb/databaseaccounts': '2023-04-15',
  'microsoft.app/containerapps': '2023-05-01'
};

const DELETE_ORDER = [
  'microsoft.containerservice/managedclusters',
  'microsoft.web/sites',
  'microsoft.sql/servers/databases',
  'microsoft.sql/servers',
  'microsoft.dbformysql/servers',
  'microsoft.dbforpostgresql/servers',
  'microsoft.cache/redis',
  'microsoft.compute/virtualmachines',
  'microsoft.app/containerapps',
  'microsoft.compute/disks',
  'microsoft.compute/snapshots',
  'microsoft.storage/storageaccounts',
  'microsoft.network/networkinterfaces',
  'microsoft.network/publicipaddresses',
  'microsoft.network/loadbalancers',
  'microsoft.network/applicationgateways',
  'microsoft.network/natgateways',
  'microsoft.network/networksecuritygroups',
  'microsoft.network/virtualnetworks',
  'microsoft.keyvault/vaults',
  'microsoft.containerregistry/registries',
  'microsoft.compute/sshpublickeys',
  'microsoft.web/serverfarms',
  'microsoft.cognitiveservices/accounts',
  'microsoft.documentdb/databaseaccounts'
];

function getApiVersion(resourceType) {
  const normalized = String(resourceType || '').toLowerCase();
  return API_VERSIONS[normalized] || '2022-09-01';
}

function getDeleteOrderIndex(resourceType) {
  const normalized = String(resourceType || '').toLowerCase();
  const index = DELETE_ORDER.indexOf(normalized);
  return index === -1 ? 999 : index;
}

async function listResourcesInResourceGroup(resourceGroupName) {
  const client = getArmClient();
  const resources = [];

  for await (const resource of client.resources.listByResourceGroup(resourceGroupName)) {
    resources.push(resource);
  }

  return resources;
}

const sortResourcesForDeletion = (resources) =>
  [...resources].sort((a, b) => {
    const orderDiff = getDeleteOrderIndex(a.type) - getDeleteOrderIndex(b.type);
    if (orderDiff !== 0) {
      return orderDiff;
    }

    const aDepth = (a.id || '').split('/').length;
    const bDepth = (b.id || '').split('/').length;
    return bDepth - aDepth;
  });

async function deleteSingleResource(client, resource) {
  const resourceType = String(resource.type || '').toLowerCase();

  if (resourceType === 'microsoft.resources/resourcegroups') {
    return null;
  }

  if (resource.tags?.['racko:protected'] === 'true') {
    console.log(JSON.stringify({
      service: 'resource-cleanup-service',
      event: 'resource_skipped_protected',
      resourceName: resource.name,
      resourceType: resource.type
    }));
    return null;
  }

  const apiVersion = getApiVersion(resource.type);

  console.log(JSON.stringify({
    service: 'resource-cleanup-service',
    event: 'resource_delete_started',
    resourceName: resource.name,
    resourceType: resource.type,
    apiVersion
  }));

  await client.resources.beginDeleteByIdAndWait(resource.id, apiVersion);

  return {
    resourceId: resource.id,
    resourceType: resource.type,
    resourceName: resource.name
  };
}

async function deleteResourceList(resourceGroupName, resources) {
  const client = getArmClient();
  const deleted = [];
  const sorted = sortResourcesForDeletion(resources);

  for (const resource of sorted) {
    try {
      const result = await deleteSingleResource(client, resource);
      if (!result) {
        continue;
      }

      deleted.push(result);

      console.log(JSON.stringify({
        service: 'resource-cleanup-service',
        event: 'resource_deleted',
        resourceGroup: resourceGroupName,
        resourceName: result.resourceName,
        resourceType: result.resourceType
      }));
    } catch (err) {
      if (err.statusCode === 404) {
        continue;
      }

      console.error(JSON.stringify({
        service: 'resource-cleanup-service',
        event: 'resource_delete_failed',
        resourceGroup: resourceGroupName,
        resourceName: resource.name,
        resourceType: resource.type,
        error: err.message
      }));
    }
  }

  return deleted;
}

/**
 * Deletes ALL resources inside a resource group but keeps the RG itself.
 */
async function deleteResourcesInsideRG(resourceGroupName) {
  const resources = await listResourcesInResourceGroup(resourceGroupName);

  if (!resources.length) {
    console.log(JSON.stringify({
      service: 'resource-cleanup-service',
      event: 'no_resources_in_rg',
      resourceGroup: resourceGroupName
    }));
    return [];
  }

  console.log(JSON.stringify({
    service: 'resource-cleanup-service',
    event: 'resources_found',
    resourceGroup: resourceGroupName,
    count: resources.length
  }));

  const expanded = expandDeploymentResources(resources, resources);
  return deleteResourceList(resourceGroupName, expanded);
}

const resolveSharedUserResources = (resources, ownership, { allowFullResourceGroup = false } = {}) => {
  let userResources = filterResourcesForUser(resources, ownership);

  if (!userResources.length && allowFullResourceGroup && resources.length) {
    console.log(JSON.stringify({
      service: 'resource-cleanup-service',
      event: 'shared_rg_single_user_fallback',
      resourceGroupName: ownership.resourceGroupName,
      entraObjectId: ownership.entraObjectId,
      resourceCount: resources.length
    }));
    userResources = resources;
  }

  return expandDeploymentResources(resources, userResources);
};

/**
 * In a shared RG, deletes only resources created by a specific user.
 * Resources are matched by owner tags, username patterns, or user number patterns.
 */
async function deleteUserResourcesInSharedRG(
  resourceGroupName,
  { entraObjectId, username, userNumber, allowFullResourceGroup = false } = {}
) {
  const resources = await listResourcesInResourceGroup(resourceGroupName);
  const userResources = resolveSharedUserResources(
    resources,
    { entraObjectId, username, userNumber, resourceGroupName },
    { allowFullResourceGroup }
  );

  if (!userResources.length) {
    console.log(JSON.stringify({
      service: 'resource-cleanup-service',
      event: 'no_user_resources_found_in_shared_rg',
      resourceGroupName,
      entraObjectId,
      username
    }));
    return [];
  }

  return deleteResourceList(resourceGroupName, userResources);
}

const normalizeResourceAction = (action) => (action === 'pause' ? 'pause' : 'delete');

async function runResourceActionForUser({
  costingMode,
  perUserResourceGroupName,
  sharedResourceGroupName,
  entraObjectId,
  username,
  userNumber,
  activeUserCount,
  action
}) {
  const resolvedAction = normalizeResourceAction(action);
  const allowFullResourceGroup = Number(activeUserCount) === 1;
  const ownership = {
    entraObjectId,
    username,
    userNumber,
    allowFullResourceGroup
  };

  if (resolvedAction === 'pause') {
    const { pauseResourcesInsideRG, pauseUserResourcesInSharedRG } = require('./resourcePauseService');

    if (costingMode === 'per_user' && perUserResourceGroupName) {
      const paused = await pauseResourcesInsideRG(perUserResourceGroupName);
      if (paused.length || !sharedResourceGroupName) {
        return paused;
      }
    }

    if (sharedResourceGroupName && entraObjectId) {
      return pauseUserResourcesInSharedRG(sharedResourceGroupName, ownership);
    }

    return [];
  }

  if (costingMode === 'per_user' && perUserResourceGroupName) {
    const deleted = await deleteResourcesInsideRG(perUserResourceGroupName);
    if (deleted.length || !sharedResourceGroupName) {
      return deleted;
    }
  }

  if (sharedResourceGroupName && entraObjectId) {
    return deleteUserResourcesInSharedRG(sharedResourceGroupName, ownership);
  }

  return [];
}

async function executeCleanupForRequest(requestId, triggeredBy = 'scheduler') {
  console.log(`[Cleanup] ===== Starting cleanup for request ${requestId} (${triggeredBy}) =====`);

  const { rows: requestRows } = await db.query(
    `
      SELECT
        id,
        costing_mode,
        azure_resource_group_name,
        resource_cleanup_interval_hours,
        resource_cleanup_action,
        customer_email
      FROM requests
      WHERE id = $1
    `,
    [requestId]
  );

  if (!requestRows.length) {
    throw new Error(`Request ${requestId} not found`);
  }

  const request = requestRows[0];
  const resolvedAction = normalizeResourceAction(request.resource_cleanup_action);
  const cleanupResult = await runResourceCleanupForRequest(requestId, resolvedAction);

  const totalDeleted = cleanupResult.deleted?.length ?? 0;

  console.log(
    `[Cleanup] ===== Done — ${totalDeleted} resources ${resolvedAction === 'pause' ? 'paused' : 'deleted'} =====`
  );

  return {
    requestId,
    triggeredBy,
    ranAt: new Date().toISOString(),
    action: cleanupResult.action,
    totalDeleted,
    affected: cleanupResult.affected,
    deleted: cleanupResult.deleted
  };
}

async function runResourceCleanupForRequest(requestId, actionOverride = null) {
  const { rows: requestRows } = await db.query(
    `
      SELECT
        id,
        costing_mode,
        azure_resource_group_name,
        resource_cleanup_interval_hours,
        resource_cleanup_action,
        customer_email
      FROM requests
      WHERE id = $1
    `,
    [requestId]
  );

  if (!requestRows.length) {
    throw new Error(`Request ${requestId} not found`);
  }

  const request = requestRows[0];
  const resolvedAction = normalizeResourceAction(actionOverride || request.resource_cleanup_action);
  const allAffected = [];
  const userResults = [];
  const errors = [];

  const { rows: activeUsers } = await db.query(
    `
      SELECT id
      FROM azure_users
      WHERE request_id = $1
        AND COALESCE(is_deleted, FALSE) = FALSE
    `,
    [requestId]
  );
  const activeUserCount = activeUsers.length;

  if (request.costing_mode === 'per_user') {
    const { rows: users } = await db.query(
      `
        SELECT
          id,
          username,
          user_number,
          azure_user_id,
          azure_resource_group_name,
          cleanup_disabled,
          cleanup_interval_override
        FROM azure_users
        WHERE request_id = $1
          AND azure_resource_group_name IS NOT NULL
          AND COALESCE(is_deleted, FALSE) = FALSE
      `,
      [requestId]
    );

    const now = new Date();

    for (const user of users) {
      if (user.cleanup_disabled) {
        console.log(
          JSON.stringify({
            service: 'resource-cleanup-service',
            event: 'user_cleanup_skipped_disabled',
            requestId,
            userId: user.id
          })
        );
        continue;
      }

      if (user.cleanup_interval_override) {
        const { rows: lastCleanup } = await db.query(
          `
            SELECT ran_at
            FROM resource_cleanup_logs
            WHERE request_id = $1
              AND resources_deleted::text LIKE '%' || $2 || '%'
            ORDER BY ran_at DESC
            LIMIT 1
          `,
          [requestId, user.azure_resource_group_name]
        );

        if (lastCleanup.length) {
          const lastRan = new Date(lastCleanup[0].ran_at);
          const intervalMs = user.cleanup_interval_override * 60 * 60 * 1000;
          const nextDue = new Date(lastRan.getTime() + intervalMs);

          if (now < nextDue) {
            console.log(
              JSON.stringify({
                service: 'resource-cleanup-service',
                event: 'user_cleanup_skipped_interval_not_due',
                requestId,
                userId: user.id,
                nextDue: nextDue.toISOString()
              })
            );
            continue;
          }
        }
      }

      const rgName = user.azure_resource_group_name;
      console.log(`[Cleanup] Processing RG: ${rgName} for user: ${user.username}`);
      const userResult = { username: user.username, rgName, deleted: [], failed: [] };

      try {
        const { captureUserLabMetrics, recordCleanupSnapshot } = require('./labHistoryService');
        const metrics = await captureUserLabMetrics(requestId, user.id);

        const affected = await runResourceActionForUser({
          costingMode: request.costing_mode,
          perUserResourceGroupName: user.azure_resource_group_name,
          sharedResourceGroupName: request.azure_resource_group_name,
          entraObjectId: user.azure_user_id,
          username: user.username,
          userNumber: user.user_number,
          activeUserCount,
          action: resolvedAction
        });

        if (metrics) {
          await recordCleanupSnapshot({
            requestId,
            userId: user.id,
            triggeredBy: 'scheduler',
            cleanupAction: resolvedAction,
            resourcesDeleted: affected,
            metrics
          }).catch((snapshotError) => {
            console.warn(
              `[Cleanup] History snapshot failed for user ${user.id}: ${snapshotError.message}`
            );
          });
        }

        for (const item of affected) {
          userResult.deleted.push({
            name: item.resourceName,
            type: item.resourceType?.split('/').pop() || item.resourceType
          });
        }

        allAffected.push(...affected);
      } catch (err) {
        console.error(`[Cleanup] Error processing RG ${rgName}:`, err.message);
        userResult.failed.push({ error: err.message });
        errors.push({ username: user.username, error: err.message });
      }

      userResults.push(userResult);
      console.log(
        `[Cleanup] ${user.username}: ${resolvedAction === 'pause' ? 'paused' : 'deleted'} ${userResult.deleted.length}, failed ${userResult.failed.length}`
      );
    }
  } else if (request.azure_resource_group_name) {
    const { rows: users } = await db.query(
      `
        SELECT id, username, user_number, azure_user_id, cleanup_disabled, cleanup_interval_override
        FROM azure_users
        WHERE request_id = $1
          AND COALESCE(is_deleted, FALSE) = FALSE
      `,
      [requestId]
    );

    const now = new Date();

    for (const user of users) {
      if (user.cleanup_disabled) {
        continue;
      }

      if (user.cleanup_interval_override) {
        const { rows: lastCleanup } = await db.query(
          `
            SELECT ran_at
            FROM resource_cleanup_logs
            WHERE request_id = $1
              AND resources_deleted::text LIKE '%' || $2 || '%'
            ORDER BY ran_at DESC
            LIMIT 1
          `,
          [requestId, user.azure_user_id]
        );

        if (lastCleanup.length) {
          const lastRan = new Date(lastCleanup[0].ran_at);
          const intervalMs = user.cleanup_interval_override * 60 * 60 * 1000;
          const nextDue = new Date(lastRan.getTime() + intervalMs);

          if (now < nextDue) {
            continue;
          }
        }
      }

      console.log(`[Cleanup] Processing shared RG for user: ${user.username}`);

      try {
        const affected = await runResourceActionForUser({
          costingMode: request.costing_mode,
          sharedResourceGroupName: request.azure_resource_group_name,
          entraObjectId: user.azure_user_id,
          username: user.username,
          userNumber: user.user_number,
          activeUserCount,
          action: resolvedAction
        });
        allAffected.push(...affected);
      } catch (err) {
        console.error(`[Cleanup] Error processing shared RG for ${user.username}:`, err.message);
        errors.push({ username: user.username, error: err.message });
      }
    }
  }

  return {
    action: resolvedAction,
    affected: allAffected,
    deleted: resolvedAction === 'delete' ? allAffected : [],
    userResults,
    errors
  };
}

module.exports = {
  listResourcesInResourceGroup,
  deleteResourcesInsideRG,
  deleteUserResourcesInSharedRG,
  runResourceActionForUser,
  runResourceCleanupForRequest,
  executeCleanupForRequest
};
