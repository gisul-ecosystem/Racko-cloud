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
  const rgComplete = Boolean(snapshot.provision?.resourceGroup);
  const servicesComplete =
    overrides.services === true || (snapshot.services?.resources?.length ?? 0) > 0;
  const usersComplete = (snapshot.users?.users?.length ?? 0) > 0;
  const rolesComplete = (snapshot.roles?.roles?.length ?? 0) > 0;
  const credentialsComplete =
    overrides.credentials === true || isCredentialDeliveryComplete(snapshot.credentials);

  const completion: Record<ProvisionStepKey, boolean> = {
    resourceGroup: rgComplete,
    services: servicesComplete,
    users: usersComplete,
    roles: rolesComplete,
    credentials: credentialsComplete,
  };

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
