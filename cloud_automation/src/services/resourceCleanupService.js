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

async function listResourcesInResourceGroup(resourceGroupName) {
  const client = getArmClient();
  const resources = [];

  for await (const resource of client.resources.listByResourceGroup(resourceGroupName)) {
    resources.push(resource);
  }

  return resources;
}

const DELETION_PRIORITY = {
  'Microsoft.Compute/virtualMachines': 10,
  'Microsoft.Web/sites': 10,
  'Microsoft.ContainerService/managedClusters': 10,
  'Microsoft.App/containerApps': 15,
  'Microsoft.Sql/servers/databases': 20,
  'Microsoft.Network/networkInterfaces': 30,
  'Microsoft.Network/publicIPAddresses': 40,
  'Microsoft.Network/loadBalancers': 40,
  'Microsoft.Network/applicationGateways': 45,
  'Microsoft.Compute/disks': 50,
  'Microsoft.Compute/snapshots': 50,
  'Microsoft.Network/natGateways': 55,
  'Microsoft.Network/networkSecurityGroups': 60,
  'Microsoft.Network/virtualNetworks': 70,
  'Microsoft.Sql/servers': 80,
  'Microsoft.Storage/storageAccounts': 80,
  'Microsoft.KeyVault/vaults': 90,
  'Microsoft.Compute/sshPublicKeys': 95
};

const getDeletionPriority = (resource) => {
  const resourceType = String(resource?.type || '');
  if (DELETION_PRIORITY[resourceType] != null) {
    return DELETION_PRIORITY[resourceType];
  }

  const depth = (resource.id || '').split('/').length;
  return 100 + depth;
};

const sortResourcesForDeletion = (resources) =>
  [...resources].sort((a, b) => {
    const priorityDiff = getDeletionPriority(a) - getDeletionPriority(b);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    const aDepth = (a.id || '').split('/').length;
    const bDepth = (b.id || '').split('/').length;
    return bDepth - aDepth;
  });

async function deleteSingleResource(client, resourceGroupName, resource) {
  const typeParts = (resource.type || '').split('/');
  const provider = typeParts[0];
  const resourceType = typeParts.slice(1).join('/');
  const resourceName = resource.name;
  const apiVersion = await getApiVersionForType(client, provider, resourceType);

  await client.resources.beginDeleteAndWait(
    resourceGroupName,
    provider,
    '',
    resourceType,
    resourceName,
    apiVersion
  );

  return {
    resourceId: resource.id,
    resourceType: resource.type,
    resourceName: resource.name
  };
}

async function deleteResourceList(resourceGroupName, resources) {
  const client = getArmClient();
  const deleted = [];
  const deletedIds = new Set();
  const targetIds = new Set(resources.map((resource) => resource.id).filter(Boolean));
  let remaining = [...resources];
  const maxPasses = 3;

  for (let pass = 1; pass <= maxPasses && remaining.length > 0; pass += 1) {
    const sorted = sortResourcesForDeletion(remaining);

    for (const resource of sorted) {
      if (deletedIds.has(resource.id)) {
        continue;
      }

      try {
        const result = await deleteSingleResource(client, resourceGroupName, resource);
        deleted.push(result);
        deletedIds.add(resource.id);

        console.log(JSON.stringify({
          service: 'resource-cleanup-service',
          event: 'resource_deleted',
          resourceGroup: resourceGroupName,
          resourceName: result.resourceName,
          resourceType: result.resourceType,
          pass
        }));
      } catch (err) {
        if (err.statusCode === 404) {
          deletedIds.add(resource.id);
          continue;
        }

        console.error(JSON.stringify({
          service: 'resource-cleanup-service',
          event: 'resource_delete_failed',
          resourceGroup: resourceGroupName,
          resourceName: resource.name,
          resourceType: resource.type,
          pass,
          error: err.message
        }));
      }
    }

    if (pass >= maxPasses) {
      break;
    }

    const stillPresent = await listResourcesInResourceGroup(resourceGroupName);
    remaining = stillPresent.filter(
      (resource) => targetIds.has(resource.id) && !deletedIds.has(resource.id)
    );
  }

  return deleted;
}

/**
 * Deletes ALL resources inside a resource group but keeps the RG itself.
 */
async function deleteResourcesInsideRG(resourceGroupName) {
  const resources = await listResourcesInResourceGroup(resourceGroupName);

  if (!resources.length) {
    return [];
  }

  const expanded = expandDeploymentResources(resources, resources);
  return deleteResourceList(resourceGroupName, expanded);
}

async function getApiVersionForType(client, provider, resourceType) {
  const known = {
    'Microsoft.Compute/virtualMachines': '2023-07-01',
    'Microsoft.Compute/disks': '2023-04-02',
    'Microsoft.Compute/snapshots': '2023-04-02',
    'Microsoft.Sql/servers': '2023-02-01-preview',
    'Microsoft.Sql/servers/databases': '2023-02-01-preview',
    'Microsoft.Storage/storageAccounts': '2023-01-01',
    'Microsoft.Network/virtualNetworks': '2023-05-01',
    'Microsoft.Network/networkInterfaces': '2023-05-01',
    'Microsoft.Network/publicIPAddresses': '2023-05-01',
    'Microsoft.Network/networkSecurityGroups': '2023-05-01',
    'Microsoft.ContainerService/managedClusters': '2023-08-01',
    'Microsoft.DocumentDB/databaseAccounts': '2023-04-15',
    'Microsoft.KeyVault/vaults': '2023-07-01',
    'Microsoft.Web/sites': '2023-01-01'
  };

  const key = `${provider}/${resourceType}`;
  if (known[key]) {
    return known[key];
  }

  try {
    const providerInfo = await client.providers.get(provider);
    const typeInfo = providerInfo.resourceTypes?.find(
      (entry) => entry.resourceType?.toLowerCase() === resourceType.toLowerCase()
    );
    const versions = typeInfo?.apiVersions || [];
    const stable = versions.filter((version) => !version.includes('preview'));
    return stable[0] || versions[0] || '2023-01-01';
  } catch {
    return '2023-01-01';
  }
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

async function runResourceCleanupForRequest(requestId, actionOverride = null) {
  const { rows: requestRows } = await db.query(
    `
      SELECT
        id,
        costing_mode,
        azure_resource_group_name,
        resource_cleanup_interval_hours,
        resource_cleanup_action
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
            service: 'resource-cleanup-scheduler',
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
                service: 'resource-cleanup-scheduler',
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
      allAffected.push(...affected);
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
    }
  }

  return {
    action: resolvedAction,
    affected: allAffected,
    deleted: resolvedAction === 'delete' ? allAffected : []
  };
}

module.exports = {
  listResourcesInResourceGroup,
  deleteResourcesInsideRG,
  deleteUserResourcesInSharedRG,
  runResourceActionForUser,
  runResourceCleanupForRequest
};
