import type { ProvisioningRequest } from './index';

export type ProvisionStepKey =
  | 'resourceGroup'
  | 'services'
  | 'users'
  | 'roles'
  | 'fabric'
  | 'credentials';

export type ProvisionStepStatus = 'pending' | 'active' | 'complete' | 'failed';

export interface ProvisionStepDefinition {
  key: ProvisionStepKey;
  label: string;
}

export const PROVISION_STEPS: ProvisionStepDefinition[] = [
  { key: 'resourceGroup', label: 'Resource Group Creating' },
  { key: 'services', label: 'Setting Instance Policies' },
  { key: 'users', label: 'Users Creating' },
  { key: 'roles', label: 'Assigning Access' },
  { key: 'fabric', label: 'Fabric Workspace & Permissions' },
  { key: 'credentials', label: 'Sending Access Link' },
];

export interface ProvisionedUser {
  azure_user_id?: string;
  azureUserId?: string;
  username?: string;
  temporary_password?: string;
  temporaryPassword?: string;
  status?: string;
}

export interface ProvisionedRole {
  username?: string;
  role?: string;
  service_id?: number;
  serviceId?: number;
  scope?: string;
}

export interface ProvisionedServiceResource {
  service_id?: number;
  serviceId?: number;
  instance_option?: string;
  instanceOption?: string;
  resource_type?: string;
  resource_name?: string;
  status?: string;
  error_message?: string | null;
}

export interface CredentialDelivery {
  deliveryStatus?: string | null;
  recipientEmail?: string | null;
  sentAt?: string | null;
  spreadsheetAvailable?: boolean;
}

export interface ProvisionCohort {
  id?: number;
  cohortIndex: number;
  userNumberFrom: number;
  userNumberTo: number;
  status: string;
  currentStep: ProvisionStepKey | 'done' | string;
  lastError?: string | null;
  cohortTotal?: number;
}

export interface ProvisionSnapshot {
  request: ProvisioningRequest | null;
  provision: {
    status?: string;
    resourceGroup?: string | null;
    resourceGroupId?: string | null;
    resourceGroupCount?: number | null;
    accountCount?: number | null;
    costingMode?: string | null;
    complete?: boolean;
  } | null;
  services: {
    resources: ProvisionedServiceResource[];
    count: number;
    complete?: boolean;
  };
  users: {
    users: ProvisionedUser[];
    count: number;
    complete?: boolean;
  };
  roles: {
    roles: ProvisionedRole[];
    count: number;
    complete?: boolean;
    remaining?: number;
  };
  fabric: {
    required: boolean;
    complete: boolean;
    status?: string | null;
    workspaceId?: string | null;
    capacityId?: string | null;
    workspaceName?: string | null;
    workspaceRole?: string | null;
    onelakePermissions?: string | null;
    items?: unknown[];
    roleAssignments?: unknown[];
    certTag?: string | null;
    errorMessage?: string | null;
  };
  credentials: CredentialDelivery | null;
  /** Wave / cohort provisioning (users 1–10, then 11–20, …). */
  cohorts?: ProvisionCohort[];
  activeCohort?: ProvisionCohort | null;
  cohortTotal?: number;
  cohortsCompleted?: number;
  allCohortsComplete?: boolean;
  fetchedAt: string;
}

export interface ProvisionStepState {
  key: ProvisionStepKey;
  label: string;
  status: ProvisionStepStatus;
  error?: string | null;
}

export type OrchestrationEventLevel = 'info' | 'success' | 'error';

export interface OrchestrationEvent {
  id: string;
  timestamp: string;
  step?: ProvisionStepKey;
  level: OrchestrationEventLevel;
  message: string;
}

export interface ProvisionProgressSummary {
  requestId: number;
  resourceGroup: string | null;
  usersCreated: number;
  rolesAssigned: number;
  accessLinkStatus: string;
  lastRefresh: string;
  isComplete: boolean;
}
