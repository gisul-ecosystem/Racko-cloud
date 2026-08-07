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
  roles?: boolean;
  fabric?: boolean;
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

export function isRolesStepComplete(
  snapshot: ProvisionSnapshot,
  overrides: StepCompletionOverrides = {}
): boolean {
  if (!isUsersStepComplete(snapshot)) {
    return false;
  }

  if (overrides.roles === true) {
    return true;
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

export function isFabricStepComplete(
  snapshot: ProvisionSnapshot,
  overrides: StepCompletionOverrides
): boolean {
  if (!isRolesStepComplete(snapshot, overrides)) {
    return false;
  }

  if (overrides.fabric === true) {
    return true;
  }

  // Non-lab Azure requests skip Fabric.
  if (!snapshot.fabric || snapshot.fabric.required !== true) {
    return true;
  }

  return snapshot.fabric.complete === true;
}

export function isCredentialStepComplete(
  snapshot: ProvisionSnapshot,
  overrides: StepCompletionOverrides
): boolean {
  return overrides.credentials === true || isCredentialDeliveryComplete(snapshot.credentials);
}

const COHORT_STEP_ORDER: Array<ProvisionStepKey | 'done'> = [
  'resourceGroup',
  'services',
  'users',
  'roles',
  'fabric',
  'done',
];

/** Absolute completion from DB snapshot (ignores cohort wave state). */
export function getAbsoluteStepCompletionMap(
  snapshot: ProvisionSnapshot,
  overrides: StepCompletionOverrides = {}
): Record<ProvisionStepKey, boolean> {
  return {
    resourceGroup: isResourceGroupStepComplete(snapshot),
    services: isServicesStepComplete(snapshot, overrides),
    users: isUsersStepComplete(snapshot),
    roles: isRolesStepComplete(snapshot, overrides),
    fabric: isFabricStepComplete(snapshot, overrides),
    credentials: isCredentialStepComplete(snapshot, overrides),
  };
}

/** When per-user cohorts exist, step completion is relative to the active wave. */
function getCohortRelativeCompletion(
  snapshot: ProvisionSnapshot,
  overrides: StepCompletionOverrides
): Record<ProvisionStepKey, boolean> | null {
  // Shared labs never use waves — leftover cohort rows must not drive the UI.
  if (!isPerUserCostingRequest(snapshot)) {
    return null;
  }

  const active = snapshot.activeCohort;
  const hasCohorts = (snapshot.cohortTotal ?? snapshot.cohorts?.length ?? 0) > 0;

  if (!hasCohorts) {
    return null;
  }

  if (snapshot.allCohortsComplete) {
    return {
      resourceGroup: true,
      services: true,
      users: true,
      roles: true,
      fabric: true,
      credentials: isCredentialStepComplete(snapshot, overrides),
    };
  }

  if (!active) {
    return null;
  }

  const current = String(active.currentStep || 'resourceGroup');
  const currentIdx = COHORT_STEP_ORDER.indexOf(current as ProvisionStepKey | 'done');
  const idx = currentIdx >= 0 ? currentIdx : 0;

  const fabricRequired = snapshot.fabric?.required === true;

  return {
    resourceGroup: idx > 0,
    services: idx > 1,
    users: idx > 2,
    roles: idx > 3,
    fabric: !fabricRequired || idx > 4,
    // Credentials only after every wave finishes.
    credentials: false,
  };
}

export function getStepCompletionMap(
  snapshot: ProvisionSnapshot,
  overrides: StepCompletionOverrides = {}
): Record<ProvisionStepKey, boolean> {
  const cohortMap = getCohortRelativeCompletion(snapshot, overrides);
  if (cohortMap) {
    // If Azure/DB already finished a step, never regress it because the wave
    // pointer is still on an earlier step (stale cohort / shared leftover).
    const absolute = getAbsoluteStepCompletionMap(snapshot, overrides);
    return {
      resourceGroup: cohortMap.resourceGroup || absolute.resourceGroup,
      services: cohortMap.services || absolute.services,
      users: cohortMap.users || absolute.users,
      roles: cohortMap.roles || absolute.roles,
      fabric: cohortMap.fabric || absolute.fabric,
      credentials: cohortMap.credentials || absolute.credentials,
    };
  }

  return getAbsoluteStepCompletionMap(snapshot, overrides);
}

export function getCohortWaveLabel(snapshot: ProvisionSnapshot): string | null {
  if (!isPerUserCostingRequest(snapshot)) {
    return null;
  }

  const total = snapshot.cohortTotal ?? snapshot.cohorts?.length ?? 0;
  if (total <= 0) return null;

  if (snapshot.allCohortsComplete) {
    return `All ${total} waves complete`;
  }

  const active = snapshot.activeCohort;
  if (!active) return `${total} waves`;

  return `Wave ${active.cohortIndex} of ${total} (users ${active.userNumberFrom}–${active.userNumberTo})`;
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

function getCohortStepError(
  snapshot: ProvisionSnapshot
): { stepKey: ProvisionStepKey; message: string } | null {
  const active = snapshot.activeCohort;
  if (!active || String(active.status).toLowerCase() !== 'failed') {
    return null;
  }

  const step = String(active.currentStep || '');
  if (
    step !== 'resourceGroup' &&
    step !== 'services' &&
    step !== 'users' &&
    step !== 'roles' &&
    step !== 'fabric'
  ) {
    return null;
  }

  const message = String(active.lastError || '').trim();
  if (!message) {
    return null;
  }

  return { stepKey: step as ProvisionStepKey, message };
}

export function deriveStepStates(
  snapshot: ProvisionSnapshot,
  overrides: StepCompletionOverrides = {},
  stepErrors: Partial<Record<ProvisionStepKey, string>> = {}
): ProvisionStepState[] {
  const completion = getStepCompletionMap(snapshot, overrides);
  const cohortError = getCohortStepError(snapshot);
  const visibleSteps = PROVISION_STEPS.filter(
    (step) => step.key !== 'fabric' || snapshot.fabric?.required === true
  );

  let activeAssigned = false;
  let blockedByFailure = false;

  return visibleSteps.map((step) => {
    const isComplete = completion[step.key];
    const error =
      stepErrors[step.key] ??
      (cohortError?.stepKey === step.key ? cohortError.message : null);

    let status: ProvisionStepStatus = 'pending';

    if (error) {
      status = 'failed';
      blockedByFailure = true;
    } else if (isComplete) {
      status = 'complete';
    } else if (!activeAssigned && !blockedByFailure) {
      status = 'active';
      activeAssigned = true;
    }

    const hasLicense = Boolean(
      snapshot.request?.microsoft_license_sku_id
        || snapshot.request?.microsoftLicenseSkuId
    );

    const fabricLabel =
      step.key === 'fabric' && snapshot.fabric?.certTag
        ? `Fabric ${snapshot.fabric.certTag} Workspace & Permissions`
        : step.label;

    return {
      key: step.key,
      label:
        step.key === 'users' && hasLicense
          ? 'Creating Users & Assigning License'
          : fabricLabel,
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
  const absolute = getAbsoluteStepCompletionMap(snapshot, overrides);

  // Cohort driver (per-user only): honor active wave step even if Fabric is hidden.
  const active = snapshot.activeCohort;
  if (
    isPerUserCostingRequest(snapshot) &&
    active &&
    !snapshot.allCohortsComplete
  ) {
    if (String(active.status).toLowerCase() === 'failed') {
      // Wait for explicit Retry — do not auto-POST a failed wave.
      return null;
    }

    const step = String(active.currentStep || '');
    if (
      step === 'resourceGroup' ||
      step === 'services' ||
      step === 'users' ||
      step === 'roles' ||
      step === 'fabric'
    ) {
      // Wave pointer can lag behind Azure/DB — skip already-finished steps.
      if (step !== 'fabric' && absolute[step as ProvisionStepKey]) {
        // Fall through to derived next step from completion map.
      } else if (step === 'fabric') {
        // Always POST fabric — service no-ops when not required and advances the wave.
        return 'fabric';
      } else {
        return step as ProvisionStepKey;
      }
    }
  }

  const steps = deriveStepStates(snapshot, overrides, stepErrors);
  if (steps.some((step) => step.status === 'failed')) {
    return null;
  }
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
