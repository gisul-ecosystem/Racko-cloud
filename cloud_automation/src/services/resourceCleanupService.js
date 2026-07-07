const { ResourceManagementClient } = require('@azure/arm-resources');
const db = require('../db/postgres');
const { createAzureCredential, validateAzureEnv } = require('../config/azure');

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

/**
 * Deletes ALL resources inside a resource group but keeps the RG itself.
 */
async function deleteResourcesInsideRG(resourceGroupName) {
  const client = getArmClient();
  const deleted = [];
  const resources = [];

  for await (const resource of client.resources.listByResourceGroup(resourceGroupName)) {
    resources.push(resource);
  }

  if (!resources.length) {
    return deleted;
  }

  const sorted = resources.sort((a, b) => {
    const aDepth = (a.id || '').split('/').length;
    const bDepth = (b.id || '').split('/').length;
    return bDepth - aDepth;
  });

  for (const resource of sorted) {
    try {
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

      deleted.push({
        resourceId: resource.id,
        resourceType: resource.type,
        resourceName: resource.name
      });

      console.log(JSON.stringify({
        service: 'resource-cleanup-service',
        event: 'resource_deleted',
        resourceGroup: resourceGroupName,
        resourceName,
        resourceType: resource.type
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
        error: err.message
      }));
    }
  }

  return deleted;
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

/**
 * In a shared RG, deletes only resources created by a specific user.
 * Resources are matched by racko_owner or created_by tags (Entra object ID).
 */
async function deleteUserResourcesInSharedRG(resourceGroupName, entraObjectId) {
  const client = getArmClient();
  const deleted = [];
  const resources = [];

  for await (const resource of client.resources.listByResourceGroup(resourceGroupName)) {
    resources.push(resource);
  }

  const userResources = resources.filter(
    (resource) =>
      resource.tags?.racko_owner === entraObjectId ||
      resource.tags?.created_by === entraObjectId
  );

  if (!userResources.length) {
    console.log(JSON.stringify({
      service: 'resource-cleanup-service',
      event: 'no_user_resources_found_in_shared_rg',
      resourceGroupName,
      entraObjectId
    }));
    return deleted;
  }

  const sorted = userResources.sort(
    (a, b) => (b.id || '').split('/').length - (a.id || '').split('/').length
  );

  for (const resource of sorted) {
    try {
      const typeParts = (resource.type || '').split('/');
      const provider = typeParts[0];
      const resourceType = typeParts.slice(1).join('/');

      const apiVersion = await getApiVersionForType(client, provider, resourceType);

      await client.resources.beginDeleteAndWait(
        resourceGroupName,
        provider,
        '',
        resourceType,
        resource.name,
        apiVersion
      );

      deleted.push({
        resourceId: resource.id,
        resourceType: resource.type,
        resourceName: resource.name
      });
    } catch (err) {
      if (err.statusCode === 404) {
        continue;
      }

      console.error(JSON.stringify({
        service: 'resource-cleanup-service',
        event: 'user_resource_delete_failed',
        resourceGroup: resourceGroupName,
        resourceName: resource.name,
        error: err.message
      }));
    }
  }

  return deleted;
}

async function runResourceCleanupForRequest(requestId) {
  const { rows: requestRows } = await db.query(
    `
      SELECT id, costing_mode, azure_resource_group_name, resource_cleanup_interval_hours
      FROM requests
      WHERE id = $1
    `,
    [requestId]
  );

  if (!requestRows.length) {
    throw new Error(`Request ${requestId} not found`);
  }

  const request = requestRows[0];
  const allDeleted = [];

  if (request.costing_mode === 'per_user') {
    const { rows: users } = await db.query(
      `
        SELECT id, azure_resource_group_name, cleanup_disabled, cleanup_interval_override
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

      const deleted = await deleteResourcesInsideRG(user.azure_resource_group_name);
      allDeleted.push(...deleted);
    }
  } else if (request.azure_resource_group_name) {
    const deleted = await deleteResourcesInsideRG(request.azure_resource_group_name);
    allDeleted.push(...deleted);
  }

  return { deleted: allDeleted };
}

module.exports = {
  deleteResourcesInsideRG,
  deleteUserResourcesInSharedRG,
  runResourceCleanupForRequest
};
