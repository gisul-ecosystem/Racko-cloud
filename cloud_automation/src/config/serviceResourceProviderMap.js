const normalizeServiceKey = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^azure\s+/, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Every lab deploys network-backed resources in the selected region. */
const BASELINE_RESOURCE_TYPES = [{ provider: 'Microsoft.Network', resourceType: 'networkInterfaces' }];

const SERVICE_RESOURCE_TYPES = {
  'virtual machines': [{ provider: 'Microsoft.Compute', resourceType: 'virtualMachines' }],
  vm: [{ provider: 'Microsoft.Compute', resourceType: 'virtualMachines' }],
  'kubernetes service': [{ provider: 'Microsoft.ContainerService', resourceType: 'managedClusters' }],
  aks: [{ provider: 'Microsoft.ContainerService', resourceType: 'managedClusters' }],
  'app service': [{ provider: 'Microsoft.Web', resourceType: 'sites' }],
  functions: [{ provider: 'Microsoft.Web', resourceType: 'sites' }],
  'blob storage': [{ provider: 'Microsoft.Storage', resourceType: 'storageAccounts' }],
  'data lake storage': [{ provider: 'Microsoft.Storage', resourceType: 'storageAccounts' }],
  storage: [{ provider: 'Microsoft.Storage', resourceType: 'storageAccounts' }],
  'sql database': [{ provider: 'Microsoft.Sql', resourceType: 'servers' }],
  sql: [{ provider: 'Microsoft.Sql', resourceType: 'servers' }],
  'cosmos db': [{ provider: 'Microsoft.DocumentDB', resourceType: 'databaseAccounts' }],
  cosmos: [{ provider: 'Microsoft.DocumentDB', resourceType: 'databaseAccounts' }],
  'key vault': [{ provider: 'Microsoft.KeyVault', resourceType: 'vaults' }],
  keyvault: [{ provider: 'Microsoft.KeyVault', resourceType: 'vaults' }],
  'service bus': [{ provider: 'Microsoft.ServiceBus', resourceType: 'namespaces' }],
  'event grid': [
    { provider: 'Microsoft.EventGrid', resourceType: 'topics' },
    { provider: 'Microsoft.EventGrid', resourceType: 'systemTopics' }
  ],
  'logic apps': [{ provider: 'Microsoft.Logic', resourceType: 'workflows' }],
  'application insights': [{ provider: 'Microsoft.Insights', resourceType: 'components' }],
  'azure monitor': [{ provider: 'Microsoft.Insights', resourceType: 'components' }],
  monitor: [{ provider: 'Microsoft.Insights', resourceType: 'components' }],
  'virtual network': [{ provider: 'Microsoft.Network', resourceType: 'virtualNetworks' }],
  vnet: [{ provider: 'Microsoft.Network', resourceType: 'virtualNetworks' }],
  'load balancer': [{ provider: 'Microsoft.Network', resourceType: 'loadBalancers' }],
  'application gateway': [{ provider: 'Microsoft.Network', resourceType: 'applicationGateways' }],
  cdn: [{ provider: 'Microsoft.Cdn', resourceType: 'profiles' }],
  'openai service': [{ provider: 'Microsoft.CognitiveServices', resourceType: 'accounts' }],
  'ai search': [{ provider: 'Microsoft.Search', resourceType: 'searchServices' }],
  search: [{ provider: 'Microsoft.Search', resourceType: 'searchServices' }],
  'machine learning': [{ provider: 'Microsoft.MachineLearningServices', resourceType: 'workspaces' }],
  'ai vision': [{ provider: 'Microsoft.CognitiveServices', resourceType: 'accounts' }],
  'ai language': [{ provider: 'Microsoft.CognitiveServices', resourceType: 'accounts' }],
  'ai speech': [{ provider: 'Microsoft.CognitiveServices', resourceType: 'accounts' }],
  'document intelligence': [{ provider: 'Microsoft.CognitiveServices', resourceType: 'accounts' }],
  'bot service': [{ provider: 'Microsoft.BotService', resourceType: 'botServices' }],
  'ai foundry': [{ provider: 'Microsoft.CognitiveServices', resourceType: 'accounts' }],
  'defender for cloud': [{ provider: 'Microsoft.Security', resourceType: 'automations' }],
  'api management': [{ provider: 'Microsoft.ApiManagement', resourceType: 'service' }],
  apim: [{ provider: 'Microsoft.ApiManagement', resourceType: 'service' }],
  'log analytics': [{ provider: 'Microsoft.OperationalInsights', resourceType: 'workspaces' }],
  'container registry': [{ provider: 'Microsoft.ContainerRegistry', resourceType: 'registries' }],
  acr: [{ provider: 'Microsoft.ContainerRegistry', resourceType: 'registries' }]
};

const getServiceResourceTypes = (serviceName) => {
  const normalizedKey = normalizeServiceKey(serviceName);

  if (!normalizedKey || /entra id|azure devops/.test(normalizedKey)) {
    return [];
  }

  for (const [key, resourceTypes] of Object.entries(SERVICE_RESOURCE_TYPES)) {
    if (normalizedKey === key || normalizedKey.includes(key)) {
      return resourceTypes;
    }
  }

  return [];
};

const getLocationConstraintsForService = (serviceName) => ({
  resourceTypes: [...BASELINE_RESOURCE_TYPES, ...getServiceResourceTypes(serviceName)]
});

module.exports = {
  BASELINE_RESOURCE_TYPES,
  SERVICE_RESOURCE_TYPES,
  normalizeServiceKey,
  getServiceResourceTypes,
  getLocationConstraintsForService
};
