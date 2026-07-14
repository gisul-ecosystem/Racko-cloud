const SERVICE_PRICING_MAP = {
  'azure virtual machines (vms)': 'Virtual Machines',
  'azure virtual machine': 'Virtual Machines',
  'virtual machines': 'Virtual Machines',
  'virtual machine': 'Virtual Machines',
  vm: 'Virtual Machines',
  'azure kubernetes service (aks)': 'Azure Kubernetes Service',
  'azure kubernetes service': 'Azure Kubernetes Service',
  aks: 'Azure Kubernetes Service',
  'azure app service': 'Azure App Service',
  'azure functions': 'Functions',
  functions: 'Functions',
  'azure blob storage': 'Storage',
  'azure data lake storage': 'Storage',
  storage: 'Storage',
  'azure sql database': 'SQL Database',
  'azure sql': 'SQL Database',
  'sql database': 'SQL Database',
  sql: 'SQL Database',
  'azure cosmos db': 'Azure Cosmos DB',
  cosmos: 'Azure Cosmos DB',
  'azure openai service': 'Azure OpenAI Service',
  'azure ai search': 'Azure AI Search',
  search: 'Azure AI Search',
  'azure key vault': 'Key Vault',
  keyvault: 'Key Vault',
  'azure keyvault': 'Key Vault',
  'azure ai document intelligence': 'Foundry Tools',
  'document intelligence': 'Foundry Tools',
  'azure ai vision': 'Foundry Tools',
  'azure ai language': 'Foundry Tools',
  'azure ai speech': 'Foundry Tools',
  'azure service bus': 'Service Bus',
  'service bus': 'Service Bus',
  'azure event grid': 'Event Grid',
  'event grid': 'Event Grid',
  'azure logic apps': 'Logic Apps',
  'logic apps': 'Logic Apps',
  'application insights': 'Azure Monitor',
  'azure monitor': 'Azure Monitor',
  'azure devops': 'Azure DevOps',
  'microsoft entra id (azure ad)': 'Microsoft Entra ID',
  'entra id': 'Microsoft Entra ID',
  'azure api management': 'API Management',
  'api management': 'API Management',
  apim: 'API Management',
  'log analytics workspace': 'Log Analytics',
  'log analytics': 'Log Analytics',
  'azure container registry': 'Container Registry',
  'container registry': 'Container Registry',
  acr: 'Container Registry',
  'azure cdn': 'Content Delivery Network',
  cdn: 'Content Delivery Network',
  'azure load balancer': 'Load Balancer',
  'load balancer': 'Load Balancer',
  'azure application gateway': 'Application Gateway',
  'application gateway': 'Application Gateway',
  'azure bot service': 'Bot Service',
  'bot service': 'Bot Service'
};

const normalizeServiceKey = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toLowerCase().replace(/\s+/g, ' ');
};

const getAzureServiceName = (service) => {
  const candidate =
    typeof service === 'string'
      ? service
      : service?.name || service?.azure_role || service?.category || '';

  const normalizedKey = normalizeServiceKey(candidate);

  if (!normalizedKey) {
    return null;
  }

  if (SERVICE_PRICING_MAP[normalizedKey]) {
    return SERVICE_PRICING_MAP[normalizedKey];
  }

  for (const [key, azureName] of Object.entries(SERVICE_PRICING_MAP)) {
    if (normalizedKey.includes(key)) {
      return azureName;
    }
  }

  return candidate.trim();
};

const resolveAzureRetailServiceName = (service) => getAzureServiceName(service);

module.exports = {
  SERVICE_PRICING_MAP,
  getAzureServiceName,
  normalizeServiceKey,
  resolveAzureRetailServiceName
};
