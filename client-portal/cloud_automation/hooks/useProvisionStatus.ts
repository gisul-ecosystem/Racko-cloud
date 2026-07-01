'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/apiClient';
import {
  fetchProvisionSnapshot,
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
  buildProgressSummary,
  createOrchestrationEvent,
  deriveStepStates,
  getNextProvisionStepKey,
  isSnapshotProvisioningComplete,
} from '../utils/provisionSnapshot';

const POLL_INTERVAL_MS = 4000;

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
}

const STEP_ACTIONS: Record<ProvisionStepKey, (requestId: number) => Promise<unknown>> = {
  resourceGroup: provisionResourceGroup,
  services: provisionServices,
  users: provisionUsers,
  roles: provisionRoles,
  credentials: sendProvisionCredentials,
};

const EMPTY_SNAPSHOT: ProvisionSnapshot = {
  request: null,
  provision: null,
  services: { resources: [], count: 0 },
  users: { users: [], count: 0 },
  roles: { roles: [], count: 0 },
  credentials: null,
  fetchedAt: new Date().toISOString(),
};

export function useProvisionStatus({
  requestId,
  initialSnapshot = null,
  initialError = null,
}: UseProvisionStatusOptions): UseProvisionStatusResult {
  const [snapshot, setSnapshot] = useState<ProvisionSnapshot | null>(initialSnapshot);
  const [overrides, setOverrides] = useState<StepCompletionOverrides>({});
  const [stepErrors, setStepErrors] = useState<Partial<Record<ProvisionStepKey, string>>>({});
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
  const orchestratingRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const overridesRef = useRef<StepCompletionOverrides>({});
  const isCompleteRef = useRef(false);
  const deliveryPendingRef = useRef(false);

  const appendEvent = useCallback((event: OrchestrationEvent) => {
    setEvents((current) => [event, ...current].slice(0, 40));
  }, []);

  const loadSnapshot = useCallback(async () => {
    const nextSnapshot = await fetchProvisionSnapshot(requestId);
    deliveryPendingRef.current = isAccessLinkDeliveryPending(nextSnapshot);
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

      const nextStep = getNextProvisionStepKey(currentSnapshot, currentOverrides);
      if (!nextStep) return;

      const stepLabel =
        deriveStepStates(currentSnapshot, currentOverrides).find((step) => step.key === nextStep)
          ?.label ?? nextStep;

      orchestratingRef.current = true;
      appendEvent(
        createOrchestrationEvent(`${stepLabel} — orchestration started.`, 'info', nextStep)
      );

      try {
        await STEP_ACTIONS[nextStep](requestId);

        if (nextStep === 'services' || nextStep === 'credentials') {
          const nextOverrides = { ...overridesRef.current, [nextStep]: true };
          overridesRef.current = nextOverrides;
          setOverrides(nextOverrides);
        }

        setStepErrors((current) => {
          const next = { ...current };
          delete next[nextStep];
          return next;
        });

        appendEvent(
          createOrchestrationEvent(`${stepLabel} — completed successfully.`, 'success', nextStep)
        );

        const refreshed = await loadSnapshot();
        if (isSnapshotProvisioningComplete(refreshed, overridesRef.current)) {
          isCompleteRef.current = true;
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
    },
    [appendEvent, loadSnapshot, requestId]
  );

  const refresh = useCallback(async (isManual = false) => {
    if (!Number.isInteger(requestId) || requestId <= 0) {
      setError('Invalid request ID.');
      setLoading(false);
      return;
    }

    try {
      if (!snapshot) setLoading(true);

      const currentSnapshot = await loadSnapshot();
      if (isManual) {
        appendEvent(createOrchestrationEvent('Snapshot refreshed from backend.', 'info'));
      }

      if (!isSnapshotProvisioningComplete(currentSnapshot, overridesRef.current)) {
        await runNextStep(currentSnapshot);
      } else {
        isCompleteRef.current = true;
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
  }, [appendEvent, loadSnapshot, requestId, runNextStep, snapshot]);

  useEffect(() => {
    void refresh();

    pollRef.current = setInterval(() => {
      if (!isCompleteRef.current || deliveryPendingRef.current) {
        void refresh();
      }
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
  };
}
