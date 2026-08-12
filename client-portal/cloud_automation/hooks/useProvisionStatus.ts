'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/apiClient';
import {
  fetchProvisionSnapshot,
  provisionFabric,
  provisionResourceGroup,
  provisionRoles,
  provisionServices,
  provisionUsers,
  sendProvisionCredentials,
  type ProvisionStepStatus,
} from '../api/client';
import type {
  OrchestrationEvent,
  ProvisionProgressSummary,
  ProvisionSnapshot,
  ProvisionStepKey,
  ProvisionStepState,
} from '../types/provisioning';
import type { StepCompletionOverrides } from '../utils/provisionSnapshot';
import {
  areProvisionPrerequisitesMet,
  buildProgressSummary,
  createOrchestrationEvent,
  deriveStepStates,
  getAbsoluteStepCompletionMap,
  getCohortWaveLabel,
  getNextProvisionStepKey,
  isCredentialDeliveryComplete,
  isSnapshotProvisioningComplete,
} from '../utils/provisionSnapshot';

const POLL_INTERVAL_MS = 2000;
const AUTO_RETRY_STEPS = new Set<ProvisionStepKey>([
  'resourceGroup',
  'services',
  'users',
  'roles',
  'fabric',
]);
const RETRIABLE_HTTP_STATUSES = new Set([0, 408, 429, 500, 502, 503, 504]);
const AUTO_RETRY_BASE_MS = 2000;
const AUTO_RETRY_MAX_MS = 15000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAutoRetryStep(step: ProvisionStepKey | string): boolean {
  return AUTO_RETRY_STEPS.has(step as ProvisionStepKey);
}

function isRetriableHttpError(err: unknown): boolean {
  if (!(err instanceof ApiError)) {
    return false;
  }
  if (err.code === 'NETWORK_ERROR') {
    return true;
  }
  const message = err.message.toLowerCase();
  if (
    message.includes('subscription role assignment quota exhausted') ||
    message.includes('roleassignmentlimitexceeded')
  ) {
    return false;
  }
  return RETRIABLE_HTTP_STATUSES.has(err.status);
}

function stepProgressCount(stepResult: ProvisionStepStatus): number {
  return Math.max(
    Number(stepResult.batchCreated ?? 0),
    Number(stepResult.rolesAssigned ?? 0)
  );
}

function shouldAutoReviveFailedCohort(snapshot: ProvisionSnapshot): boolean {
  const active = snapshot.activeCohort;
  if (!active || String(active.status).toLowerCase() !== 'failed') {
    return false;
  }
  return isAutoRetryStep(String(active.currentStep || ''));
}

function isAccessLinkDeliveryPending(snapshot: ProvisionSnapshot | null): boolean {
  const status = String(snapshot?.credentials?.deliveryStatus ?? '').toLowerCase();
  return status === 'queued';
}

function formatStepFailures(stepResult: ProvisionStepStatus): string {
  const failures = Array.isArray(stepResult.failures) ? stepResult.failures : [];
  const messages = failures
    .map((failure) =>
      String(failure?.message || (failure as { error?: string }).error || '').trim()
    )
    .filter(Boolean);
  if (messages.length === 0) {
    return (
      stepResult.cohortLastError ||
      'Provisioning step failed with no progress. Retry after fixing the Azure error.'
    );
  }

  const unique = [...new Set(messages)];
  if (unique.length === 1) {
    return failures.length > 1 ? `${unique[0]} (${failures.length} users)` : unique[0];
  }

  return `${unique[0]} (+${unique.length - 1} more)`;
}

function isTerminalStepFailure(
  stepResult: ProvisionStepStatus,
  costingMode?: string | null
): boolean {
  const failures = Array.isArray(stepResult.failures) ? stepResult.failures : [];
  const hasSubscriptionLimit = failures.some((failure) => {
    const limitKind = String((failure as { limitKind?: string }).limitKind || '').toLowerCase();
    const text = String(
      failure?.message || (failure as { error?: string }).error || ''
    ).toLowerCase();
    return (
      limitKind === 'subscription' ||
      text.includes('subscription role assignment quota exhausted')
    );
  });
  if (hasSubscriptionLimit) {
    return true;
  }

  const hasRgLimitFailure = failures.some((failure) => {
    const code = String((failure as { code?: string }).code || '').toLowerCase();
    const limitKind = String((failure as { limitKind?: string }).limitKind || '').toLowerCase();
    const text = String(
      failure?.message || (failure as { error?: string }).error || ''
    ).toLowerCase();
    return (
      limitKind === 'resource_group' ||
      (code === 'roleassignmentlimitexceeded' && text.includes('resource group')) ||
      (text.includes('role assignment limit') && text.includes('resource group'))
    );
  });
  if (hasRgLimitFailure && String(costingMode || '').toLowerCase() !== 'per_user') {
    return true;
  }

  if (stepResult.failed === true) return true;

  const progress = stepProgressCount(stepResult);
  const cohortFailed = String(stepResult.cohortStatus || '').toLowerCase() === 'failed';
  if (cohortFailed) {
    // Partial role/service progress should keep auto-chaining after a transient stop.
    return progress === 0;
  }

  if (failures.length === 0) return false;

  const complete = stepResult.complete === true;
  if (complete) return false;

  const remaining = Number(stepResult.remaining ?? NaN);
  if (progress > 0) return false;
  if (!Number.isFinite(remaining) || remaining > 0) {
    return true;
  }

  return false;
}

interface UseProvisionStatusOptions {
  requestId: number;
  initialSnapshot?: ProvisionSnapshot | null;
  initialError?: string | null;
}

interface UseProvisionStatusResult {
  snapshot: ProvisionSnapshot | null;
  steps: ProvisionStepState[];
  summary: ProvisionProgressSummary | null;
  events: OrchestrationEvent[];
  loading: boolean;
  error: string | null;
  isComplete: boolean;
  refresh: (isManual?: boolean) => Promise<void>;
  retryFailedStep: () => Promise<void>;
}

const STEP_ACTIONS: Record<
  ProvisionStepKey,
  (requestId: number, options?: { retry?: boolean }) => Promise<ProvisionStepStatus | unknown>
> = {
  resourceGroup: provisionResourceGroup,
  services: provisionServices,
  users: provisionUsers,
  roles: provisionRoles,
  fabric: provisionFabric,
  credentials: sendProvisionCredentials,
};

const EMPTY_SNAPSHOT: ProvisionSnapshot = {
  request: null,
  provision: null,
  services: { resources: [], count: 0 },
  users: { users: [], count: 0 },
  roles: { roles: [], count: 0 },
  fabric: { required: false, complete: true, status: 'skipped' },
  credentials: null,
  fetchedAt: new Date().toISOString(),
};

export function useProvisionStatus({
  requestId,
  initialSnapshot = null,
  initialError = null,
}: UseProvisionStatusOptions): UseProvisionStatusResult {
  const orchestratingRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const overridesRef = useRef<StepCompletionOverrides>({});
  const stepErrorsRef = useRef<Partial<Record<ProvisionStepKey, string>>>({});
  const isCompleteRef = useRef(false);
  const deliveryPendingRef = useRef(false);
  const snapshotRef = useRef<ProvisionSnapshot | null>(initialSnapshot);
  const lastProgressKeyRef = useRef<string | null>(null);
  const retryNextStepRef = useRef(false);
  const autoRetryAttemptRef = useRef(0);
  const startOrchestrationRef = useRef<(() => Promise<void>) | null>(null);

  const [snapshot, setSnapshot] = useState<ProvisionSnapshot | null>(initialSnapshot);
  const [overrides, setOverrides] = useState<StepCompletionOverrides>({});
  const [stepErrors, setStepErrors] = useState<Partial<Record<ProvisionStepKey, string>>>({});
  stepErrorsRef.current = stepErrors;
  const [events, setEvents] = useState<OrchestrationEvent[]>(() => {
    if (initialSnapshot) {
      return [
        createOrchestrationEvent(
          `Loaded provisioning snapshot for request #${requestId}.`,
          'info'
        ),
      ];
    }
    return [];
  });
  const [loading, setLoading] = useState(!initialSnapshot);
  const [error, setError] = useState<string | null>(initialError);

  const appendEvent = useCallback((event: OrchestrationEvent) => {
    setEvents((current) => {
      const previous = current[0];
      if (
        previous &&
        previous.level === event.level &&
        previous.step === event.step &&
        previous.message === event.message
      ) {
        // Collapse identical spam (e.g. repeated "10 remaining…").
        return current;
      }
      return [event, ...current].slice(0, 40);
    });
  }, []);

  const lastCohortIndexRef = useRef<number | null>(null);

  const syncCohortFailureFromSnapshot = useCallback((nextSnapshot: ProvisionSnapshot) => {
    const active = nextSnapshot.activeCohort;
    if (!active || String(active.status).toLowerCase() !== 'failed') {
      return;
    }

    const step = String(active.currentStep || '') as ProvisionStepKey;

    // Long-running steps auto-retry transient failures — do not flash "failed" in UI.
    if (isAutoRetryStep(step)) {
      if (!orchestratingRef.current && !isCompleteRef.current && startOrchestrationRef.current) {
        retryNextStepRef.current = true;
        void startOrchestrationRef.current();
      }
      return;
    }

    const message = String(active.lastError || '').trim();
    if (
      !message ||
      (step !== 'resourceGroup' &&
        step !== 'services' &&
        step !== 'users' &&
        step !== 'roles' &&
        step !== 'fabric')
    ) {
      return;
    }

    if (stepErrorsRef.current[step] === message) {
      return;
    }

    const nextErrors = { ...stepErrorsRef.current, [step]: message };
    stepErrorsRef.current = nextErrors;
    setStepErrors(nextErrors);
    appendEvent(
      createOrchestrationEvent(
        `${getCohortWaveLabel(nextSnapshot) ? `${getCohortWaveLabel(nextSnapshot)}: ` : ''}${message}`,
        'error',
        step
      )
    );
  }, [appendEvent]);

  const loadSnapshot = useCallback(async () => {
    const nextSnapshot = await fetchProvisionSnapshot(requestId);
    deliveryPendingRef.current = isAccessLinkDeliveryPending(nextSnapshot);
    snapshotRef.current = nextSnapshot;

    const cohortIndex = nextSnapshot.activeCohort?.cohortIndex ?? null;
    if (
      cohortIndex != null &&
      lastCohortIndexRef.current != null &&
      cohortIndex !== lastCohortIndexRef.current
    ) {
      // New wave — clear per-step overrides from the previous cohort.
      overridesRef.current = {};
      setOverrides({});
      stepErrorsRef.current = {};
      setStepErrors({});
      lastProgressKeyRef.current = null;
    }
    lastCohortIndexRef.current = cohortIndex;

    if (isCredentialDeliveryComplete(nextSnapshot.credentials)) {
      const nextOverrides = { ...overridesRef.current, credentials: true };
      overridesRef.current = nextOverrides;
      setOverrides(nextOverrides);
      setStepErrors((current) => {
        if (!current.credentials) return current;
        const next = { ...current };
        delete next.credentials;
        return next;
      });
    }

    syncCohortFailureFromSnapshot(nextSnapshot);
    setSnapshot(nextSnapshot);
    setError(null);
    return nextSnapshot;
  }, [requestId, syncCohortFailureFromSnapshot]);

  const runNextStep = useCallback(
    async (currentSnapshot: ProvisionSnapshot) => {
      if (orchestratingRef.current || isCompleteRef.current) return;

      const currentOverrides = overridesRef.current;
      if (isSnapshotProvisioningComplete(currentSnapshot, currentOverrides)) {
        isCompleteRef.current = true;
        return;
      }

      let nextStep = getNextProvisionStepKey(
        currentSnapshot,
        currentOverrides,
        stepErrorsRef.current
      );

      // Explicit Retry can continue a failed wave (backend reviveFailed).
      if (!nextStep && retryNextStepRef.current) {
        const active = currentSnapshot.activeCohort;
        const step = String(active?.currentStep || '');
        if (
          active &&
          String(active.status).toLowerCase() === 'failed' &&
          (step === 'resourceGroup' ||
            step === 'services' ||
            step === 'users' ||
            step === 'roles' ||
            step === 'fabric')
        ) {
          nextStep = step as ProvisionStepKey;
        }
      }

      if (!nextStep) return;

      // Never re-POST a step Azure/DB already finished (stops shared-lab RG loops).
      const absoluteDone = getAbsoluteStepCompletionMap(
        currentSnapshot,
        currentOverrides
      );
      if (
        nextStep !== 'credentials' &&
        nextStep !== 'fabric' &&
        absoluteDone[nextStep]
      ) {
        const skippedSnapshot = await loadSnapshot();
        if (!isSnapshotProvisioningComplete(skippedSnapshot, overridesRef.current)) {
          void runNextStep(skippedSnapshot);
        } else {
          isCompleteRef.current = true;
        }
        return;
      }

      if (!areProvisionPrerequisitesMet(nextStep, currentSnapshot, currentOverrides)) {
        appendEvent(
          createOrchestrationEvent(
            `Waiting for earlier provisioning steps before ${nextStep}.`,
            'info',
            nextStep
          )
        );
        return;
      }

      if (
        nextStep === 'credentials' &&
        isCredentialDeliveryComplete(currentSnapshot.credentials)
      ) {
        const nextOverrides = { ...overridesRef.current, credentials: true };
        overridesRef.current = nextOverrides;
        setOverrides(nextOverrides);
        return;
      }

      const stepLabel =
        deriveStepStates(currentSnapshot, currentOverrides).find((step) => step.key === nextStep)
          ?.label ?? nextStep;
      const waveLabel = getCohortWaveLabel(currentSnapshot);
      const labeledStep = waveLabel ? `${waveLabel}: ${stepLabel}` : stepLabel;
      const useRetry =
        retryNextStepRef.current || shouldAutoReviveFailedCohort(currentSnapshot);
      retryNextStepRef.current = false;

      orchestratingRef.current = true;

      let shouldChainNextStep = false;
      let refreshedSnapshot: ProvisionSnapshot | null = null;

      try {
        const stepResult = (await STEP_ACTIONS[nextStep](requestId, {
          retry: useRetry,
        })) as ProvisionStepStatus;

        const partialProgress =
          stepResult &&
          typeof stepResult === 'object' &&
          'complete' in stepResult &&
          stepResult.complete === false;

        if (
          isTerminalStepFailure(
            stepResult,
            currentSnapshot.request?.costing_mode ?? currentSnapshot.request?.costingMode
          )
        ) {
          const message = formatStepFailures(stepResult);
          setStepErrors((current) => ({ ...current, [nextStep]: message }));
          stepErrorsRef.current = { ...stepErrorsRef.current, [nextStep]: message };
          appendEvent(
            createOrchestrationEvent(`${labeledStep} — ${message}`, 'error', nextStep)
          );
          refreshedSnapshot = await loadSnapshot();
          return;
        }

        if (
          nextStep === 'credentials' ||
          nextStep === 'fabric' ||
          nextStep === 'roles' ||
          (nextStep === 'services' && !partialProgress)
        ) {
          if (!partialProgress) {
            const nextOverrides = { ...overridesRef.current, [nextStep]: true };
            overridesRef.current = nextOverrides;
            setOverrides(nextOverrides);
          }
        }

        setStepErrors((current) => {
          const next = { ...current };
          delete next[nextStep];
          return next;
        });
        const cleared = { ...stepErrorsRef.current };
        delete cleared[nextStep];
        stepErrorsRef.current = cleared;

        if (partialProgress) {
          autoRetryAttemptRef.current = 0;
          const remaining =
            'remaining' in stepResult && typeof stepResult.remaining === 'number'
              ? stepResult.remaining
              : null;
          const rolesAssigned =
            'rolesAssigned' in stepResult && typeof stepResult.rolesAssigned === 'number'
              ? stepResult.rolesAssigned
              : null;
          const batchCreated =
            'batchCreated' in stepResult && typeof stepResult.batchCreated === 'number'
              ? stepResult.batchCreated
              : null;

          const progressKey = `${nextStep}:${remaining}:${rolesAssigned}:${batchCreated}`;
          if (lastProgressKeyRef.current !== progressKey) {
            lastProgressKeyRef.current = progressKey;
            appendEvent(
              createOrchestrationEvent(
                remaining != null
                  ? rolesAssigned != null
                    ? `${labeledStep} — assigned ${rolesAssigned}, ${remaining} left…`
                    : batchCreated != null && batchCreated > 0
                      ? `${labeledStep} — created ${batchCreated}, ${remaining} remaining…`
                      : `${labeledStep} — ${remaining} remaining…`
                  : `${labeledStep} — batch complete. Continuing…`,
                'info',
                nextStep
              )
            );
          }
        } else {
          autoRetryAttemptRef.current = 0;
          lastProgressKeyRef.current = null;
          appendEvent(
            createOrchestrationEvent(`${labeledStep} — completed successfully.`, 'success', nextStep)
          );
        }

        refreshedSnapshot = await loadSnapshot();
        if (isSnapshotProvisioningComplete(refreshedSnapshot, overridesRef.current)) {
          isCompleteRef.current = true;
        } else if (
          refreshedSnapshot.activeCohort &&
          String(refreshedSnapshot.activeCohort.status).toLowerCase() === 'failed'
        ) {
          shouldChainNextStep = false;
        } else {
          shouldChainNextStep = true;
        }
      } catch (err) {
        if (isRetriableHttpError(err) && isAutoRetryStep(nextStep)) {
          const delay = Math.min(
            AUTO_RETRY_MAX_MS,
            AUTO_RETRY_BASE_MS * 1.5 ** autoRetryAttemptRef.current
          );
          autoRetryAttemptRef.current += 1;

          appendEvent(
            createOrchestrationEvent(
              `${labeledStep} — interrupted (${err instanceof ApiError ? err.message : 'network error'}), retrying in ${Math.ceil(delay / 1000)}s…`,
              'info',
              nextStep
            )
          );

          await sleep(delay);
          retryNextStepRef.current = true;

          setStepErrors((current) => {
            if (!current[nextStep]) return current;
            const next = { ...current };
            delete next[nextStep];
            return next;
          });
          const cleared = { ...stepErrorsRef.current };
          delete cleared[nextStep];
          stepErrorsRef.current = cleared;

          shouldChainNextStep = true;
          refreshedSnapshot = snapshotRef.current ?? currentSnapshot;
        } else {
          autoRetryAttemptRef.current = 0;
          const message =
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Provisioning step failed.';

          setStepErrors((current) => ({ ...current, [nextStep]: message }));
          stepErrorsRef.current = { ...stepErrorsRef.current, [nextStep]: message };
          appendEvent(
            createOrchestrationEvent(`${labeledStep} — ${message}`, 'error', nextStep)
          );
        }
      } finally {
        orchestratingRef.current = false;
      }

      if (shouldChainNextStep && refreshedSnapshot && !isCompleteRef.current) {
        void runNextStep(refreshedSnapshot);
      }
    },
    [appendEvent, loadSnapshot, requestId]
  );

  const startOrchestration = useCallback(async () => {
    if (orchestratingRef.current || isCompleteRef.current) return;

    const currentSnapshot = snapshotRef.current ?? (await loadSnapshot());
    if (!isSnapshotProvisioningComplete(currentSnapshot, overridesRef.current)) {
      await runNextStep(currentSnapshot);
    } else {
      isCompleteRef.current = true;
    }
  }, [loadSnapshot, runNextStep]);

  startOrchestrationRef.current = startOrchestration;

  const refresh = useCallback(
    async (isManual = false) => {
      if (!Number.isInteger(requestId) || requestId <= 0) {
        setError('Invalid request ID.');
        setLoading(false);
        return;
      }

      try {
        if (!snapshotRef.current) setLoading(true);

        await loadSnapshot();
        if (isManual) {
          appendEvent(createOrchestrationEvent('Snapshot refreshed from backend.', 'info'));
        }

        if (isManual && !isCompleteRef.current) {
          await startOrchestration();
        }
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Failed to load provisioning status.'
        );
      } finally {
        setLoading(false);
      }
    },
    [appendEvent, loadSnapshot, requestId, startOrchestration]
  );

  const retryFailedStep = useCallback(async () => {
    const failed = deriveStepStates(
      snapshotRef.current ?? EMPTY_SNAPSHOT,
      overridesRef.current,
      stepErrorsRef.current
    ).find((step) => step.status === 'failed');

    if (failed) {
      const cleared = { ...stepErrorsRef.current };
      delete cleared[failed.key];
      stepErrorsRef.current = cleared;
      setStepErrors(cleared);
    }

    lastProgressKeyRef.current = null;
    retryNextStepRef.current = true;

    try {
      await loadSnapshot();
      await startOrchestration();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to retry provisioning step.'
      );
    }
  }, [loadSnapshot, startOrchestration]);

  useEffect(() => {
    isCompleteRef.current = false;
    orchestratingRef.current = false;
    overridesRef.current = {};
    stepErrorsRef.current = {};
    snapshotRef.current = initialSnapshot;
    lastProgressKeyRef.current = null;
    retryNextStepRef.current = false;
    autoRetryAttemptRef.current = 0;
    setOverrides({});
    setStepErrors({});
    setEvents(
      initialSnapshot
        ? [
            createOrchestrationEvent(
              `Loaded provisioning snapshot for request #${requestId}.`,
              'info'
            ),
          ]
        : []
    );

    void (async () => {
      try {
        setLoading(true);
        await loadSnapshot();
        await startOrchestration();
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Failed to load provisioning status.'
        );
      } finally {
        setLoading(false);
      }
    })();

    pollRef.current = setInterval(() => {
      if (isCompleteRef.current && !deliveryPendingRef.current) {
        return;
      }

      void loadSnapshot()
        .then((snap) => {
          if (
            !isCompleteRef.current &&
            !orchestratingRef.current &&
            snap &&
            shouldAutoReviveFailedCohort(snap) &&
            startOrchestrationRef.current
          ) {
            retryNextStepRef.current = true;
            void startOrchestrationRef.current();
          }
        })
        .catch(() => {
          // Keep the last known snapshot visible while polling.
        });
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [requestId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isCompleteRef.current && !deliveryPendingRef.current && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  });

  const steps = deriveStepStates(snapshot ?? EMPTY_SNAPSHOT, overrides, stepErrors);
  const summary = snapshot ? buildProgressSummary(requestId, snapshot, overrides) : null;
  const isComplete = summary?.isComplete ?? false;

  if (isComplete) {
    isCompleteRef.current = true;
  }

  return {
    snapshot,
    steps,
    summary,
    events,
    loading,
    error,
    isComplete,
    refresh,
    retryFailedStep,
  };
}
