const crypto = require('crypto');
const { PolicyClient } = require('@azure/arm-policy');
const { createAzureCredential, validateAzureEnv } = require('../../config/azure');
const { findInstancePolicyRule } = require('../../utils/instancePolicyRules');
const { ensureCustomPolicyDefinition } = require('./customPolicyProvisioner');

const logEvent = (event, details = {}) => {
  console.log(
    JSON.stringify({
      event,
      service: 'azure-instance-policy-provisioner',
      timestamp: new Date().toISOString(),
      ...details
    })
  );
};

const sanitizeAssignmentName = (seed) => {
  const hash = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 20);
  return `pol${hash}`;
};

const AZURE_POLICY_DISPLAY_NAME_MAX = 128;

const POLICY_DISPLAY_TYPE_LABELS = {
  allowed_vm_sku: 'VM',
  allowed_aks_node_vm_sku: 'AKS VM',
  allowed_app_service_plan_sku: 'App Service',
  allowed_storage_account_sku: 'Storage',
  allowed_sql_database_sku: 'SQL',
  allowed_service_bus_sku: 'Service Bus',
  allowed_key_vault_sku: 'Key Vault',
  allowed_cosmos_db_mode: 'Cosmos DB',
  allowed_cdn_sku: 'CDN',
  allowed_load_balancer_sku: 'Load Balancer',
  allowed_app_gateway_sku: 'App Gateway',
  allowed_search_sku: 'Search',
  allowed_cognitive_services_sku: 'Cognitive',
  allowed_bot_service_sku: 'Bot Service',
  allowed_logic_app_mode: 'Logic Apps',
  allowed_api_management_sku: 'API Management',
  allowed_log_analytics_sku: 'Log Analytics',
  allowed_container_registry_sku: 'Container Registry'
};

const buildPolicyAssignmentDisplayName = ({
  policyType,
  requestId,
  instanceOption,
  allowedSkus = []
}) => {
  const skus = (Array.isArray(allowedSkus) ? allowedSkus : [])
    .map((sku) => String(sku || '').trim())
    .filter(Boolean);
  const label = POLICY_DISPLAY_TYPE_LABELS[policyType] || 'Instance';
  const primary = skus[0] || String(instanceOption || '').trim() || 'default';

  let displayName =
    skus.length <= 1
      ? `Racko ${label} ${primary} (req ${requestId})`
      : `Racko ${label} ${primary} +${skus.length - 1} more (req ${requestId})`;

  if (displayName.length > AZURE_POLICY_DISPLAY_NAME_MAX) {
    displayName = `Racko ${label} req ${requestId} (${skus.length} SKUs)`;
  }

  return displayName.slice(0, AZURE_POLICY_DISPLAY_NAME_MAX);
};

const createPolicyClient = () => {
  const azureConfig = validateAzureEnv();
  const credential = createAzureCredential(azureConfig);

  return {
    policyClient: new PolicyClient(credential, azureConfig.subscriptionId),
    subscriptionId: azureConfig.subscriptionId
  };
};

const buildResourceGroupScope = (subscriptionId, resourceGroupName) =>
  `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}`;

const isPolicyAlreadyExistsError = (error) =>
  Number(error?.statusCode || error?.status) === 409 ||
  String(error?.code || '').toLowerCase() === 'policyassignmentexists';

const assignPolicyWithRetry = async ({
  policyClient,
  scope,
  assignmentName,
  parameters,
  requestId,
  allowUpdate = false
}) => {
  try {
    return await policyClient.policyAssignments.create(scope, assignmentName, parameters);
  } catch (error) {
    if (!isPolicyAlreadyExistsError(error)) {
      throw error;
    }

    if (!allowUpdate) {
      logEvent('instance_policy_assignment_exists', { requestId, scope, assignmentName });
      return null;
    }

    logEvent('instance_policy_assignment_update_started', { requestId, scope, assignmentName });
    return policyClient.policyAssignments.create(scope, assignmentName, parameters);
  }
};

const getExistingAssignmentSkus = async ({
  policyClient,
  scope,
  assignmentName,
  parameterName = 'listOfAllowedSKUs'
}) => {
  try {
    const existing = await policyClient.policyAssignments.get(scope, assignmentName);
    const values = existing?.parameters?.[parameterName]?.value;
    return Array.isArray(values) ? values.map((value) => String(value)) : [];
  } catch (error) {
    if (Number(error?.statusCode || error?.status) === 404) {
      return [];
    }

    throw error;
  }
};

const resolvePolicyDefinitionId = async (rule) => {
  if (rule.policyDefinitionId) {
    return rule.policyDefinitionId;
  }

  if (rule.customPolicyKey) {
    return ensureCustomPolicyDefinition(rule.customPolicyKey);
  }

  return null;
};

const configureServiceInstancePolicy = async ({
  policyClient,
  scope,
  requestId,
  serviceId,
  serviceName,
  instanceOption,
  location
}) => {
  const rule = findInstancePolicyRule(serviceName);

  if (!rule) {
    logEvent('instance_policy_configure_metadata_only', {
      requestId,
      serviceId,
      serviceName,
      reason: 'no_azure_policy_rule'
    });

    return {
      resourceType: 'Microsoft.Authorization/policyAssignments',
      resourceName: `instance-policy-${serviceId}`,
      policyType: 'instance_metadata',
      azureResourceId: scope,
      status: 'policy_configured',
      errorMessage: null
    };
  }

  if (rule.policyType === 'instance_metadata') {
    logEvent('instance_policy_configure_metadata_only', {
      requestId,
      serviceId,
      serviceName,
      reason: rule.note || 'instance_metadata_only',
      allowedResourceTypes: rule.allowedResourceTypes
    });

    return {
      resourceType: 'Microsoft.Authorization/policyAssignments',
      resourceName: `instance-policy-${serviceId}`,
      policyType: 'instance_metadata',
      azureResourceId: scope,
      status: 'policy_configured',
      errorMessage: null
    };
  }

  const policyDefinitionId = await resolvePolicyDefinitionId(rule);
  if (!policyDefinitionId) {
    throw new Error(`No policy definition configured for ${rule.policyType}`);
  }

  let requestedSkus = rule.resolveAllowedSkus(instanceOption);

  if (rule.policyType === 'allowed_vm_sku') {
    const { getVmPolicyAllowedSkus } = require('../../utils/vmSize');
    requestedSkus = await getVmPolicyAllowedSkus(instanceOption, location);
  }

  const assignmentSeed = rule.mergeAssignments
    ? `${requestId}-${rule.policyType}`
    : `${requestId}-${serviceId}-${rule.policyType}`;
  const assignmentName = sanitizeAssignmentName(assignmentSeed);

  const allowedParameterName = rule.allowedParameterName || 'listOfAllowedSKUs';

  let allowedSkus = requestedSkus;
  if (rule.mergeAssignments) {
    const existingSkus = await getExistingAssignmentSkus({
      policyClient,
      scope,
      assignmentName,
      parameterName: allowedParameterName
    });
    allowedSkus = Array.from(new Set([...existingSkus, ...requestedSkus]));
  }

  const built = rule.buildParameters(instanceOption, allowedSkus);

  await assignPolicyWithRetry({
    policyClient,
    scope,
    assignmentName,
    requestId,
    allowUpdate: Boolean(rule.mergeAssignments),
    parameters: {
      displayName: buildPolicyAssignmentDisplayName({
        policyType: rule.policyType,
        requestId,
        instanceOption,
        allowedSkus
      }),
      policyDefinitionId,
      parameters: built.parameters
    }
  });

  logEvent('instance_policy_assignment_applied', {
    requestId,
    serviceId,
    serviceName,
    scope,
    assignmentName,
    allowedSkus,
    location: location || null
  });

  return {
    resourceType: 'Microsoft.Authorization/policyAssignments',
    resourceName: assignmentName,
    policyType: rule.policyType,
    azureResourceId: scope,
    status: 'policy_configured',
    errorMessage: null
  };
};

const configureInstancePolicy = async ({
  requestId,
  serviceId,
  serviceName,
  resourceGroupName,
  instanceOption,
  location
}) => {
  const { policyClient, subscriptionId } = createPolicyClient();
  const scope = buildResourceGroupScope(subscriptionId, resourceGroupName);

  logEvent('instance_policy_configure_started', {
    requestId,
    serviceId,
    serviceName,
    instanceOption,
    resourceGroupName,
    scope
  });

  const policyResult = await configureServiceInstancePolicy({
    policyClient,
    scope,
    requestId,
    serviceId,
    serviceName,
    instanceOption,
    location
  });

  logEvent('instance_policy_configure_success', {
    requestId,
    serviceId,
    serviceName,
    policyType: policyResult.policyType,
    scope
  });

  return policyResult;
};

module.exports = {
  configureInstancePolicy
};
