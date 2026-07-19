import { PROVISION_STEPS } from '../types/provisioning';
import type {
  OrchestrationEvent,
  ProvisionProgressSummary,
  ProvisionSnapshot,
  ProvisionStepKey,
  ProvisionStepState,
  ProvisionStepStatus,
} from '../types/provisioning';

export interface StepCompletionOverrides {
  services?: boolean;
  credentials?: boolean;
}

const CREDENTIAL_COMPLETE_STATUSES = new Set(['sent', 'queued']);

const STEP_ORDER: ProvisionStepKey[] = PROVISION_STEPS.map((step) => step.key);

export function getAccountCount(snapshot: ProvisionSnapshot): number {
  const fromProvision = Number(snapshot.provision?.accountCount ?? 0);
  if (Number.isInteger(fromProvision) && fromProvision > 0) {
    return fromProvision;
  }

  const request = snapshot.request;
  const fromRequest = Number(request?.account_count ?? request?.accountCount ?? 0);
  return Number.isInteger(fromRequest) && fromRequest > 0 ? fromRequest : 0;
}

function isPerUserCostingRequest(snapshot: ProvisionSnapshot): boolean {
  const mode = snapshot.request?.costing_mode ?? snapshot.request?.costingMode;
  if (!mode) {
    return true;
  }

  return mode === 'per_user';
}

export function isResourceGroupStepComplete(snapshot: ProvisionSnapshot): boolean {
  const accountCount = getAccountCount(snapshot);
  const resourceGroupCount = Number(snapshot.provision?.resourceGroupCount ?? 0);

  if (isPerUserCostingRequest(snapshot)) {
    if (accountCount <= 0) {
      return resourceGroupCount > 0 && snapshot.provision?.complete === true;
    }

    return resourceGroupCount >= accountCount || snapshot.provision?.complete === true;
  }

  return Boolean(snapshot.provision?.resourceGroup) || snapshot.provision?.complete === true;
}

export function isServicesStepComplete(
  snapshot: ProvisionSnapshot,
  overrides: StepCompletionOverrides
): boolean {
  if (!isResourceGroupStepComplete(snapshot)) {
    return false;
  }

  if (overrides.services === true || snapshot.services?.complete === true) {
    return true;
  }

  if (snapshot.services?.complete === false) {
    return false;
  }

  return (snapshot.services?.resources?.length ?? 0) > 0;
}

export function isUsersStepComplete(snapshot: ProvisionSnapshot): boolean {
  if (!isResourceGroupStepComplete(snapshot)) {
    return false;
  }

  const accountCount = getAccountCount(snapshot);
  const usersCreated = snapshot.users?.count ?? snapshot.users?.users?.length ?? 0;

  if (snapshot.users?.complete === true) {
    return true;
  }

  if (snapshot.users?.complete === false) {
    return false;
  }

  if (accountCount > 0) {
    return usersCreated >= accountCount;
  }

  return usersCreated > 0;
}

export function isRolesStepComplete(snapshot: ProvisionSnapshot): boolean {
  if (!isUsersStepComplete(snapshot)) {
    return false;
  }

  if (snapshot.roles?.complete === true) {
    return true;
  }

  if (snapshot.roles?.complete === false) {
    return false;
  }

  const accountCount = getAccountCount(snapshot);
  const usersCreated = snapshot.users?.count ?? snapshot.users?.users?.length ?? 0;

  if (accountCount > 0 && usersCreated < accountCount) {
    return false;
  }

  return (snapshot.roles?.count ?? snapshot.roles?.roles?.length ?? 0) > 0;
}

export function isCredentialStepComplete(
  snapshot: ProvisionSnapshot,
  overrides: StepCompletionOverrides
): boolean {
  return overrides.credentials === true || isCredentialDeliveryComplete(snapshot.credentials);
}

export function getStepCompletionMap(
  snapshot: ProvisionSnapshot,
  overrides: StepCompletionOverrides = {}
): Record<ProvisionStepKey, boolean> {
  return {
    resourceGroup: isResourceGroupStepComplete(snapshot),
    services: isServicesStepComplete(snapshot, overrides),
    users: isUsersStepComplete(snapshot),
    roles: isRolesStepComplete(snapshot),
    credentials: isCredentialStepComplete(snapshot, overrides),
  };
}

export function areProvisionPrerequisitesMet(
  stepKey: ProvisionStepKey,
  snapshot: ProvisionSnapshot,
  overrides: StepCompletionOverrides = {}
): boolean {
  const completion = getStepCompletionMap(snapshot, overrides);
  const stepIndex = STEP_ORDER.indexOf(stepKey);

  if (stepIndex <= 0) {
    return true;
  }

  return STEP_ORDER.slice(0, stepIndex).every((key) => completion[key]);
}

export function isCredentialDeliveryComplete(
  credentials: ProvisionSnapshot['credentials']
): boolean {
  const status = String(credentials?.deliveryStatus ?? '').toLowerCase();
  return CREDENTIAL_COMPLETE_STATUSES.has(status);
}

export function isSnapshotProvisioningComplete(
  snapshot: ProvisionSnapshot,
  overrides: StepCompletionOverrides = {}
): boolean {
  return deriveStepStates(snapshot, overrides).every((step) => step.status === 'complete');
}

export function deriveStepStates(
  snapshot: ProvisionSnapshot,
  overrides: StepCompletionOverrides = {},
  stepErrors: Partial<Record<ProvisionStepKey, string>> = {}
): ProvisionStepState[] {
  const completion = getStepCompletionMap(snapshot, overrides);

  let activeAssigned = false;

  return PROVISION_STEPS.map((step) => {
    const isComplete = completion[step.key];
    const error = stepErrors[step.key] ?? null;

    let status: ProvisionStepStatus = 'pending';

    if (error) {
      status = 'failed';
    } else if (isComplete) {
      status = 'complete';
    } else if (!activeAssigned) {
      status = 'active';
      activeAssigned = true;
    }

    return {
      key: step.key,
      label: step.label,
      status,
      error,
    };
  });
}

export function getCompletedStepCount(steps: ProvisionStepState[]): number {
  return steps.filter((step) => step.status === 'complete').length;
}

export function getNextProvisionStepKey(
  snapshot: ProvisionSnapshot,
  overrides: StepCompletionOverrides = {},
  stepErrors: Partial<Record<ProvisionStepKey, string>> = {}
): ProvisionStepKey | null {
  const steps = deriveStepStates(snapshot, overrides, stepErrors);
  const next = steps.find((step) => step.status === 'active');
  return next?.key ?? null;
}

export function buildProgressSummary(
  requestId: number,
  snapshot: ProvisionSnapshot,
  overrides: StepCompletionOverrides = {}
): ProvisionProgressSummary {
  const steps = deriveStepStates(snapshot, overrides);
  const credentialsStatus = snapshot.credentials?.deliveryStatus ?? 'pending';

  return {
    requestId,
    resourceGroup: snapshot.provision?.resourceGroup ?? null,
    usersCreated: snapshot.users?.count ?? snapshot.users?.users?.length ?? 0,
    rolesAssigned: snapshot.roles?.count ?? snapshot.roles?.roles?.length ?? 0,
    accessLinkStatus: credentialsStatus ? String(credentialsStatus) : 'pending',
    lastRefresh: snapshot.fetchedAt,
    isComplete: steps.every((step) => step.status === 'complete'),
  };
}

export function createOrchestrationEvent(
  message: string,
  level: OrchestrationEvent['level'] = 'info',
  step?: ProvisionStepKey
): OrchestrationEvent {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    level,
    message,
    step,
  };
}
