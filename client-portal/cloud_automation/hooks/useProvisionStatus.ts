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
  getNextProvisionStepKey,
  isCredentialDeliveryComplete,
  isSnapshotProvisioningComplete,
} from '../utils/provisionSnapshot';

const POLL_INTERVAL_MS = 2000;

function isAccessLinkDeliveryPending(snapshot: ProvisionSnapshot | null): boolean {
  const status = String(snapshot?.credentials?.deliveryStatus ?? '').toLowerCase();
  return status === 'queued';
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

const STEP_ACTIONS: Record<ProvisionStepKey, (requestId: number) => Promise<unknown>> = {
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
    setEvents((current) => [event, ...current].slice(0, 40));
  }, []);

  const loadSnapshot = useCallback(async () => {
    const nextSnapshot = await fetchProvisionSnapshot(requestId);
    deliveryPendingRef.current = isAccessLinkDeliveryPending(nextSnapshot);
    snapshotRef.current = nextSnapshot;

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

    setSnapshot(nextSnapshot);
    setError(null);
    return nextSnapshot;
  }, [requestId]);

  const runNextStep = useCallback(
    async (currentSnapshot: ProvisionSnapshot) => {
      if (orchestratingRef.current || isCompleteRef.current) return;

      const currentOverrides = overridesRef.current;
      if (isSnapshotProvisioningComplete(currentSnapshot, currentOverrides)) {
        isCompleteRef.current = true;
        return;
      }

      const nextStep = getNextProvisionStepKey(
        currentSnapshot,
        currentOverrides,
        stepErrorsRef.current
      );
      if (!nextStep) return;

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

      orchestratingRef.current = true;
      appendEvent(
        createOrchestrationEvent(`${stepLabel} — orchestration started.`, 'info', nextStep)
      );

      let shouldChainNextStep = false;
      let refreshedSnapshot: ProvisionSnapshot | null = null;

      try {
        const stepResult = await STEP_ACTIONS[nextStep](requestId);

        const partialProgress =
          stepResult &&
          typeof stepResult === 'object' &&
          'complete' in stepResult &&
          stepResult.complete === false;

        if (
          nextStep === 'credentials' ||
          nextStep === 'fabric' ||
          (nextStep === 'services' && !partialProgress)
        ) {
          const nextOverrides = { ...overridesRef.current, [nextStep]: true };
          overridesRef.current = nextOverrides;
          setOverrides(nextOverrides);
        }

        setStepErrors((current) => {
          const next = { ...current };
          delete next[nextStep];
          return next;
        });

        if (partialProgress) {
          const remaining =
            'remaining' in stepResult && typeof stepResult.remaining === 'number'
              ? stepResult.remaining
              : null;
          appendEvent(
            createOrchestrationEvent(
              remaining != null
                ? `${stepLabel} — batch complete, ${remaining} remaining. Continuing…`
                : `${stepLabel} — batch complete. Continuing…`,
              'info',
              nextStep
            )
          );
        } else {
          appendEvent(
            createOrchestrationEvent(`${stepLabel} — completed successfully.`, 'success', nextStep)
          );
        }

        refreshedSnapshot = await loadSnapshot();
        if (isSnapshotProvisioningComplete(refreshedSnapshot, overridesRef.current)) {
          isCompleteRef.current = true;
        } else {
          shouldChainNextStep = true;
        }
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Provisioning step failed.';

        setStepErrors((current) => ({ ...current, [nextStep]: message }));
        appendEvent(
          createOrchestrationEvent(`${stepLabel} — ${message}`, 'error', nextStep)
        );
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

      void loadSnapshot().catch(() => {
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
