const { ResourceManagementClient } = require('@azure/arm-resources');
const { KeyVaultManagementClient } = require('@azure/arm-keyvault');
const { createAzureCredential, validateAzureEnv } = require('../../config/azure');
const {
  createRoleAssignmentWithRetry,
  findMatchingRoleDefinition,
  getExistingAzureAssignment,
  logAzureRoleEvent,
  roleAssignmentIdFromSeed
} = require('./roleProvisioner');
const { getRoleProvisionConcurrency } = require('../../utils/provisionConcurrency');

const CONCURRENCY_LIMIT = getRoleProvisionConcurrency();

const API_VERSIONS = {
  'microsoft.cognitiveservices/accounts': '2023-05-01',
  'microsoft.search/searchservices': '2023-11-01',
  'microsoft.keyvault/vaults': '2023-02-01',
  'microsoft.apimanagement/service': '2022-08-01',
  'microsoft.operationalinsights/workspaces': '2022-10-01',
  'microsoft.containerregistry/registries': '2023-07-01'
};

const SPEECH_KIND_PATTERN = /speech/i;

const SERVICE_RESOURCE_RULES = {
  'Azure AI Speech': {
    resourceType: 'microsoft.cognitiveservices/accounts',
    kindPattern: SPEECH_KIND_PATTERN,
    roles: ['Cognitive Services Speech User', 'Cognitive Services User']
  },
  'Azure AI Search': {
    resourceType: 'microsoft.search/searchservices',
    roles: ['Search Index Data Contributor', 'Search Service Contributor']
  },
  'Azure Key Vault': {
    resourceType: 'microsoft.keyvault/vaults',
    rbacRole: 'Key Vault Secrets User',
    secretPermissions: ['get', 'list']
  },
  'Azure API Management': {
    resourceType: 'microsoft.apimanagement/service',
    roles: ['API Management Service Operator Role', 'API Management Service Reader']
  },
  'Log Analytics Workspace': {
    resourceType: 'microsoft.operationalinsights/workspaces',
    roles: ['Log Analytics Contributor', 'Log Analytics Reader']
  },
  'Azure Container Registry': {
    resourceType: 'microsoft.containerregistry/registries',
    roles: ['AcrPush', 'AcrPull']
  }
};

const KEY_VAULT_TRIGGER_SERVICES = new Set(['Azure Key Vault', 'Azure AI Foundry']);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const parseResourceId = (resourceId) => {
  const match = String(resourceId || '').match(
    /\/subscriptions\/[^/]+\/resourceGroups\/([^/]+)\/providers\/([^/]+)\/([^/]+)\/([^/]+)/i
  );

  if (!match) {
    return null;
  }

  return {
    resourceGroupName: match[1],
    provider: match[2],
    resourceType: match[3],
    resourceName: match[4]
  };
};

const normalizeResourceType = (value) => String(value || '').toLowerCase();

const createResourceClient = () => {
  const azureConfig = validateAzureEnv();
  const credential = createAzureCredential(azureConfig);
  return {
    resourceClient: new ResourceManagementClient(credential, azureConfig.subscriptionId),
    keyVaultClient: new KeyVaultManagementClient(credential, azureConfig.subscriptionId),
    subscriptionId: azureConfig.subscriptionId,
    tenantId: azureConfig.tenantId
  };
};

const getResourceKind = async (resourceClient, resourceId, resourceType) => {
  const apiVersion = API_VERSIONS[normalizeResourceType(resourceType)] || '2022-09-01';

  try {
    const resource = await resourceClient.resources.getById(resourceId, apiVersion);
    return resource?.kind || null;
  } catch (error) {
    logAzureRoleEvent('warn', 'resource_kind_lookup_failed', {
      resourceId,
      resourceType,
      message: error?.message
    });
    return null;
  }
};

const listResourcesForRule = async (resourceClient, resourceGroupName, rule) => {
  const matches = [];

  for await (const resource of resourceClient.resources.listByResourceGroup(resourceGroupName)) {
    const normalizedType = normalizeResourceType(resource.type);
    if (normalizedType !== rule.resourceType) {
      continue;
    }

    if (rule.kindPattern) {
      const kind = resource.kind || (await getResourceKind(resourceClient, resource.id, resource.type));
      if (!kind || !rule.kindPattern.test(kind)) {
        continue;
      }
    }

    matches.push(resource);
  }

  return matches;
};

const hasSecretPermissions = (policy, requiredPermissions) => {
  const granted = new Set((policy?.permissions?.secrets || []).map((p) => String(p).toLowerCase()));
  return requiredPermissions.every((permission) => granted.has(String(permission).toLowerCase()));
};

const assignRbacRoleAtScope = async ({
  authorizationClient,
  scope,
  roleName,
  principalId,
  requestId,
  userId,
  seedParts
}) => {
  const definition = await findMatchingRoleDefinition(authorizationClient, scope, roleName);
  if (!definition?.id) {
    throw new Error(`Role definition "${roleName}" not found at scope ${scope}`);
  }

  const assignmentSeed = [...seedParts, scope, definition.id].join(':');
  const assignmentId = roleAssignmentIdFromSeed(assignmentSeed);
  const existingAzureAssignment = await getExistingAzureAssignment(authorizationClient, scope, assignmentId);

  if (!existingAzureAssignment) {
    try {
      await createRoleAssignmentWithRetry(
        authorizationClient,
        scope,
        assignmentId,
        {
          principalId,
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
  }

  return {
    assignmentId,
    requestId,
    userId,
    azureRole: roleName,
    scope,
    status: 'assigned',
    assignedAt: new Date(),
    assignmentKind: 'rbac',
    entraGroupId: null
  };
};

const ensureKeyVaultAccessPolicy = async ({
  keyVaultClient,
  resourceId,
  principalId,
  secretPermissions
}) => {
  const parsed = parseResourceId(resourceId);
  if (!parsed) {
    throw new Error(`Unable to parse Key Vault resource id: ${resourceId}`);
  }

  const vault = await keyVaultClient.vaults.get(parsed.resourceGroupName, parsed.resourceName);
  const accessPolicies = [...(vault.properties?.accessPolicies || [])];
  const normalizedPermissions = secretPermissions.map((p) => String(p).toLowerCase());
  const existingPolicy = accessPolicies.find((policy) => policy.objectId === principalId);

  if (existingPolicy && hasSecretPermissions(existingPolicy, normalizedPermissions)) {
    return { updated: false, authorizationModel: 'access_policy' };
  }

  if (existingPolicy) {
    const mergedSecrets = new Set([
      ...(existingPolicy.permissions?.secrets || []).map((p) => String(p).toLowerCase()),
      ...normalizedPermissions
    ]);
    existingPolicy.permissions = {
      ...(existingPolicy.permissions || {}),
      secrets: [...mergedSecrets]
    };
  } else {
    accessPolicies.push({
      tenantId: vault.properties.tenantId,
      objectId: principalId,
      permissions: {
        secrets: normalizedPermissions,
        keys: [],
        certificates: []
      }
    });
  }

  await keyVaultClient.vaults.update(parsed.resourceGroupName, parsed.resourceName, {
    location: vault.location,
    properties: {
      ...vault.properties,
      accessPolicies
    }
  });

  return { updated: true, authorizationModel: 'access_policy' };
};

const ensureKeyVaultPermissions = async ({
  authorizationClient,
  keyVaultClient,
  resourceId,
  principalId,
  requestId,
  userId,
  seedParts,
  rbacRole,
  secretPermissions
}) => {
  const parsed = parseResourceId(resourceId);
  if (!parsed) {
    throw new Error(`Unable to parse Key Vault resource id: ${resourceId}`);
  }

  const vault = await keyVaultClient.vaults.get(parsed.resourceGroupName, parsed.resourceName);
  const usesRbac = Boolean(vault.properties?.enableRbacAuthorization);

  if (usesRbac) {
    const assignment = await assignRbacRoleAtScope({
      authorizationClient,
      scope: resourceId,
      roleName: rbacRole,
      principalId,
      requestId,
      userId,
      seedParts
    });

    return {
      assignment,
      authorizationModel: 'rbac'
    };
  }

  await ensureKeyVaultAccessPolicy({
    keyVaultClient,
    resourceId,
    principalId,
    secretPermissions
  });

  return {
    assignment: {
      assignmentId: roleAssignmentIdFromSeed([...seedParts, resourceId, 'access-policy'].join(':')),
      requestId,
      userId,
      azureRole: `${rbacRole} (access policy)`,
      scope: resourceId,
      status: 'assigned',
      assignedAt: new Date(),
      assignmentKind: 'access_policy',
      entraGroupId: null
    },
    authorizationModel: 'access_policy'
  };
};

const buildActiveRules = (selectedServices) => {
  const serviceNames = new Set(selectedServices.map((service) => service.serviceName));
  const rules = [];

  if (serviceNames.has('Azure AI Speech')) {
    rules.push(SERVICE_RESOURCE_RULES['Azure AI Speech']);
  }

  if (serviceNames.has('Azure AI Search')) {
    rules.push(SERVICE_RESOURCE_RULES['Azure AI Search']);
  }

  if ([...KEY_VAULT_TRIGGER_SERVICES].some((name) => serviceNames.has(name))) {
    rules.push(SERVICE_RESOURCE_RULES['Azure Key Vault']);
  }

  if (serviceNames.has('Azure API Management')) {
    rules.push(SERVICE_RESOURCE_RULES['Azure API Management']);
  }

  if (serviceNames.has('Log Analytics Workspace')) {
    rules.push(SERVICE_RESOURCE_RULES['Log Analytics Workspace']);
  }

  if (serviceNames.has('Azure Container Registry')) {
    rules.push(SERVICE_RESOURCE_RULES['Azure Container Registry']);
  }

  return rules;
};

const assignResourceScopedPermissions = async ({
  authorizationClient,
  users,
  request,
  requestId,
  selectedServices,
  resolveUserResourceGroupName
}) => {
  const activeRules = buildActiveRules(selectedServices);
  const assignments = [];
  const failures = [];

  if (activeRules.length === 0 || users.length === 0) {
    return {
      assignments,
      failures,
      permissionsComplete: true,
      resourcesProcessed: 0
    };
  }

  const { resourceClient, keyVaultClient } = createResourceClient();
  const tasks = [];

  for (const user of users) {
    const resourceGroupName = resolveUserResourceGroupName(request, user);
    if (!resourceGroupName) {
      continue;
    }

    for (const rule of activeRules) {
      tasks.push(async () => {
        let resources = [];

        try {
          resources = await listResourcesForRule(resourceClient, resourceGroupName, rule);
        } catch (error) {
          failures.push({
            userId: user.id,
            username: user.username,
            resourceGroupName,
            resourceType: rule.resourceType,
            role: rule.roles?.join(', ') || rule.rbacRole,
            message: error?.message || 'Failed to list resources'
          });
          return [];
          }

        if (resources.length === 0) {
          logAzureRoleEvent('info', 'resource_scoped_permissions_no_resources', {
            requestId,
            username: user.username,
            resourceGroupName,
            resourceType: rule.resourceType
          });
          return [];
        }

        const userAssignments = [];

        for (const resource of resources) {
          if (rule.resourceType === 'microsoft.keyvault/vaults') {
            try {
              const result = await ensureKeyVaultPermissions({
                authorizationClient,
                keyVaultClient,
                resourceId: resource.id,
                principalId: user.azure_user_id,
                requestId,
                userId: user.id,
                seedParts: [requestId, user.id, resource.id, rule.rbacRole],
                rbacRole: rule.rbacRole,
                secretPermissions: rule.secretPermissions
              });

              userAssignments.push(result.assignment);
              logAzureRoleEvent('info', 'key_vault_permissions_assigned', {
                requestId,
                username: user.username,
                resourceId: resource.id,
                authorizationModel: result.authorizationModel
              });
            } catch (error) {
              failures.push({
                userId: user.id,
                username: user.username,
                resourceId: resource.id,
                resourceType: rule.resourceType,
                role: rule.rbacRole,
                message: error?.message || 'Key Vault permission assignment failed'
              });
              logAzureRoleEvent('error', 'key_vault_permissions_failed', {
                requestId,
                username: user.username,
                resourceId: resource.id,
                message: error?.message
              });
            }

            continue;
          }

          for (const roleName of rule.roles || []) {
            try {
              const assignment = await assignRbacRoleAtScope({
                authorizationClient,
                scope: resource.id,
                roleName,
                principalId: user.azure_user_id,
                requestId,
                userId: user.id,
                seedParts: [requestId, user.id, resource.id, roleName]
              });

              userAssignments.push(assignment);
              logAzureRoleEvent('info', 'resource_scoped_role_assigned', {
                requestId,
                username: user.username,
                resourceId: resource.id,
                roleName,
                scope: resource.id
              });
            } catch (error) {
              failures.push({
                userId: user.id,
                username: user.username,
                resourceId: resource.id,
                resourceType: rule.resourceType,
                role: roleName,
                message: error?.message || 'Resource-scoped role assignment failed'
              });
              logAzureRoleEvent('error', 'resource_scoped_role_failed', {
                requestId,
                username: user.username,
                resourceId: resource.id,
                roleName,
                message: error?.message
              });
            }

            await sleep(100);
          }
        }

        return userAssignments;
      });
    }
  }

  const results = await runConcurrent(tasks, CONCURRENCY_LIMIT);
  for (const result of results) {
    if (result.status === 'fulfilled' && Array.isArray(result.value)) {
      assignments.push(...result.value);
    }
  }

  return {
    assignments,
    failures,
    permissionsComplete: failures.length === 0,
    resourcesProcessed: assignments.length
  };
};

module.exports = {
  SERVICE_RESOURCE_RULES,
  assignResourceScopedPermissions,
  buildActiveRules,
  ensureKeyVaultPermissions,
  listResourcesForRule
};
