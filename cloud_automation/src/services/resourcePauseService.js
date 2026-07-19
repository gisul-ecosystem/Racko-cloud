const { ComputeManagementClient } = require('@azure/arm-compute');
const { SqlManagementClient } = require('@azure/arm-sql');
const { ContainerServiceClient } = require('@azure/arm-containerservice');
const { WebSiteManagementClient } = require('@azure/arm-appservice');
const { createAzureCredential, validateAzureEnv } = require('../config/azure');
const { listResourcesInResourceGroup } = require('./resourceCleanupService');
const { filterResourcesForUser } = require('../utils/resourceOwnership');

let clients = null;

const getClients = () => {
  if (clients) {
    return clients;
  }

  const azureConfig = validateAzureEnv();
  const credential = createAzureCredential(azureConfig);
  const subscriptionId = azureConfig.subscriptionId;

  clients = {
    compute: new ComputeManagementClient(credential, subscriptionId),
    sql: new SqlManagementClient(credential, subscriptionId),
    containerService: new ContainerServiceClient(credential, subscriptionId),
    webSites: new WebSiteManagementClient(credential, subscriptionId)
  };

  return clients;
};

const logEvent = (event, details = {}) => {
  console.log(
    JSON.stringify({
      service: 'resource-pause-service',
      event,
      ...details
    })
  );
};

const buildResult = (resource, action, extra = {}) => ({
  resourceId: resource.id,
  resourceType: resource.type,
  resourceName: resource.name,
  action,
  ...extra
});

async function pauseVirtualMachine(resourceGroupName, resource, computeClient) {
  await computeClient.virtualMachines.beginDeallocateAndWait(resourceGroupName, resource.name);
  return buildResult(resource, 'deallocated', { pauseType: 'vm_deallocate' });
}

async function pauseSqlDatabase(resourceGroupName, resource, sqlClient) {
  const nameParts = String(resource.name || '').split('/');
  const serverName = nameParts[0];
  const databaseName = nameParts.slice(1).join('/');

  if (!serverName || !databaseName || databaseName.toLowerCase() === 'master') {
    return null;
  }

  await sqlClient.databases.beginPauseAndWait(resourceGroupName, serverName, databaseName);
  return buildResult(resource, 'paused', { pauseType: 'sql_serverless_pause' });
}

async function pauseAksCluster(resourceGroupName, resource, containerServiceClient) {
  const clusterName = resource.name;
  const poolResults = [];

  for await (const pool of containerServiceClient.agentPools.list(resourceGroupName, clusterName)) {
    await containerServiceClient.agentPools.beginCreateOrUpdateAndWait(
      resourceGroupName,
      clusterName,
      pool.name,
      {
        ...pool,
        count: 0,
        minCount: 0,
        maxCount: 0
      }
    );

    poolResults.push(pool.name);
  }

  return buildResult(resource, 'paused', {
    pauseType: 'aks_scale_to_zero',
    nodePoolsScaled: poolResults
  });
}

async function pauseWebApp(resourceGroupName, resource, webSitesClient) {
  await webSitesClient.beginStopAndWait(resourceGroupName, resource.name);
  return buildResult(resource, 'stopped', { pauseType: 'app_service_stop' });
}

async function pauseSingleResource(resourceGroupName, resource) {
  const azureClients = getClients();
  const resourceType = String(resource.type || '').toLowerCase();

  try {
    switch (resourceType) {
      case 'microsoft.compute/virtualmachines':
        return await pauseVirtualMachine(resourceGroupName, resource, azureClients.compute);
      case 'microsoft.sql/servers/databases':
        return await pauseSqlDatabase(resourceGroupName, resource, azureClients.sql);
      case 'microsoft.containerservice/managedclusters':
        return await pauseAksCluster(resourceGroupName, resource, azureClients.containerService);
      case 'microsoft.web/sites':
        return await pauseWebApp(resourceGroupName, resource, azureClients.webSites);
      case 'microsoft.documentdb/databaseaccounts':
        return buildResult(resource, 'skipped', {
          pauseType: 'cosmos_keep',
          reason: 'Cosmos DB has no pause action — resource kept'
        });
      default:
        return null;
    }
  } catch (err) {
    if (err.statusCode === 404) {
      return null;
    }

    console.error(
      JSON.stringify({
        service: 'resource-pause-service',
        event: 'resource_pause_failed',
        resourceGroup: resourceGroupName,
        resourceName: resource.name,
        resourceType: resource.type,
        error: err.message
      })
    );

    return buildResult(resource, 'failed', { error: err.message });
  }
}

async function pauseResourcesInsideRG(resourceGroupName) {
  const resources = await listResourcesInResourceGroup(resourceGroupName);
  const paused = [];

  for (const resource of resources) {
    const result = await pauseSingleResource(resourceGroupName, resource);
    if (result) {
      paused.push(result);
      if (result.action !== 'failed') {
        logEvent('resource_paused', {
          resourceGroup: resourceGroupName,
          resourceName: resource.name,
          resourceType: resource.type,
          action: result.action
        });
      }
    }
  }

  return paused;
}

async function pauseUserResourcesInSharedRG(
  resourceGroupName,
  { entraObjectId, username, userNumber, allowFullResourceGroup = false } = {}
) {
  const resources = await listResourcesInResourceGroup(resourceGroupName);
  let userResources = filterResourcesForUser(resources, { entraObjectId, username, userNumber });

  if (!userResources.length && allowFullResourceGroup && resources.length) {
    logEvent('shared_rg_single_user_fallback', {
      resourceGroupName,
      entraObjectId,
      resourceCount: resources.length
    });
    userResources = resources;
  }

  if (!userResources.length) {
    logEvent('no_user_resources_found_in_shared_rg', {
      resourceGroupName,
      entraObjectId,
      username
    });
    return [];
  }

  const paused = [];

  for (const resource of userResources) {
    const result = await pauseSingleResource(resourceGroupName, resource);
    if (result) {
      paused.push(result);
    }
  }

  return paused;
}

module.exports = {
  pauseResourcesInsideRG,
  pauseUserResourcesInSharedRG
};
