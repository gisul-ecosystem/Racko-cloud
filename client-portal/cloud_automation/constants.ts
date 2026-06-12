/** Gateway prefix for cloud_automation admin APIs (Type 1). */
export const CLOUD_AUTOMATION_API_PREFIX = '/api/v1/cloud-automation';

/** Client routes for the Azure services area. */
export const AZURE_ROUTES = {
  dashboard: '/console/azure',
  consoleHub: '/console',
} as const;

export const AZURE_SERVICE = {
  id: 'azure',
  name: 'Azure Services',
  description: 'Azure access management, provisioning, and lab environments.',
} as const;
