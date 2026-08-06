/** Client routes for Cloud Labs (training labs). */
export const CLOUD_LABS_ROUTES = {
  hub: '/console/cloud-labs',
  azureDashboard: '/console/cloud-labs/azure',
  azureCreateRequest: '/console/cloud-labs/azure/requests/new',
  azureRequestStatus: (id: number | string) => `/console/cloud-labs/azure/requests/${id}`,
  consoleHub: '/console',
} as const;

/** Gateway prefix for cloud_automation_training APIs. */
export const CLOUD_AUTOMATION_TRAINING_API_PREFIX = '/api/v1/cloud-automation-training';

export const CLOUD_LABS_SERVICE = {
  id: 'cloud-labs',
  name: 'Cloud Labs',
  description: 'Hands-on lab environments — Azure Labs first, more clouds next.',
} as const;

export const AZURE_LABS_SERVICE = {
  id: 'azure-labs',
  name: 'Azure Labs',
  description: 'Provision and manage Azure training lab environments.',
} as const;

export type LabTemplateKind = 'azure' | 'fabric';

export interface LabTemplateCost {
  budgetCap: number;
  currency: 'USD' | 'INR';
  capacityHourlyCostUsd?: number | null;
  estimatedTotalUsd?: number | null;
  storageEstimateGb?: number | null;
  label: string;
}

export interface LabTemplate {
  id: string;
  kind: LabTemplateKind;
  name: string;
  certTag: string;
  cloud: string;
  permissions: {
    workspaceRole?: string;
    onelakePermissions?: string | null;
    rbacActions?: unknown[];
    entraDirectoryRole?: string | null;
    summary?: string[];
  };
  instances: unknown[];
  /** Azure catalog service names (non-fabric labs). */
  services?: unknown[];
  region?: string;
  durationHours: number;
  cost: LabTemplateCost;
  active: boolean;
  capacitySku?: string;
  capacityBillingMode?: string;
}
