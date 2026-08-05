'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchManagePortalUserControls,
  renewManagePortalUserBudget,
  triggerManagePortalUserCleanup,
  updateManagePortalCleanupSettings,
} from '../../api/managePortalClient';
import type { ManagePortalSession, ManagePortalUserControlData } from '../../types/managePortal';

interface ManageUserControlsCellProps {
  userId: number;
  username: string;
  session: ManagePortalSession;
  control: ManagePortalUserControlData | undefined;
  loadingAction: number | null;
  onControlUpdate: (userId: number, patch: Partial<ManagePortalUserControlData>) => void;
  onLoadingAction: (userId: number | null) => void;
  onFeedback: (message: string | null) => void;
}

export function ManageUserControlsCell({
  userId,
  username,
  session,
  control,
  loadingAction,
  onControlUpdate,
  onLoadingAction,
  onFeedback,
}: ManageUserControlsCellProps) {
  const [renewOpen, setRenewOpen] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [overrideHours, setOverrideHours] = useState('');

  const busy = loadingAction === userId;

  const handleRenewBudget = useCallback(async () => {
    if (!topUpAmount) return;
    onLoadingAction(userId);
    onFeedback(null);
    try {
      const data = await renewManagePortalUserBudget({
        userId,
        topUpAmount: parseFloat(topUpAmount),
        sessionToken: session.sessionToken,
      });
      if (data.success) {
        onControlUpdate(userId, {
          budgetExceeded: false,
          totalBudget: data.newTotalBudget,
        });
        setRenewOpen(false);
        setTopUpAmount('');
        onFeedback(`Budget renewed for ${username}. New total: $${data.newTotalBudget.toFixed(2)}`);
      }
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'Failed to renew budget.');
    } finally {
      onLoadingAction(null);
    }
  }, [onControlUpdate, onFeedback, onLoadingAction, session.sessionToken, topUpAmount, userId, username]);

  const handleCleanupToggle = useCallback(
    async (disabled: boolean) => {
      onLoadingAction(userId);
      onFeedback(null);
      try {
        await updateManagePortalCleanupSettings({
          userId,
          sessionToken: session.sessionToken,
          cleanupDisabled: disabled,
        });
        onControlUpdate(userId, { cleanupDisabled: disabled });
      } catch (error) {
        onFeedback(error instanceof Error ? error.message : 'Failed to update cleanup setting.');
      } finally {
        onLoadingAction(null);
      }
    },
    [onControlUpdate, onFeedback, onLoadingAction, session.sessionToken, userId]
  );

  const handleSaveCleanupInterval = useCallback(
    async (resetToDefault = false) => {
      onLoadingAction(userId);
      onFeedback(null);
      try {
        const override = resetToDefault || overrideHours === '' ? null : parseInt(overrideHours, 10);
        await updateManagePortalCleanupSettings({
          userId,
          sessionToken: session.sessionToken,
          cleanupIntervalOverride: override,
        });
        onControlUpdate(userId, { cleanupIntervalOverride: override });
        setCleanupOpen(false);
        setOverrideHours('');
      } catch (error) {
        onFeedback(error instanceof Error ? error.message : 'Failed to save cleanup interval.');
      } finally {
        onLoadingAction(null);
      }
    },
    [onControlUpdate, onFeedback, onLoadingAction, overrideHours, session.sessionToken, userId]
  );

  const handleManualCleanup = useCallback(async () => {
    if (!window.confirm("Delete all Azure resources inside this user's lab right now?")) {
      return;
    }
    onLoadingAction(userId);
    onFeedback(null);
    try {
      const data = await triggerManagePortalUserCleanup({
        userId,
        sessionToken: session.sessionToken,
      });
      if (data.success) {
        onFeedback(`Cleanup complete for ${username} — ${data.deletedCount} resource(s) deleted.`);
      }
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'Cleanup failed.');
    } finally {
      onLoadingAction(null);
    }
  }, [onFeedback, onLoadingAction, session.sessionToken, userId, username]);

  if (!control) {
    return <span className="text-xs text-gray-400">Loading...</span>;
  }

  const effectiveInterval =
    control.cleanupIntervalOverride ?? control.defaultCleanupInterval ?? null;

  return (
    <>
      <div className="flex min-w-[220px] flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
        {control.totalBudget !== null && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`text-xs font-medium ${
                control.budgetExceeded ? 'text-red-600' : 'text-gray-700'
              }`}
            >
              ${control.currentSpend.toFixed(2)} / ${control.totalBudget.toFixed(2)}
            </span>
            {control.budgetExceeded && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-600">
                Exceeded
              </span>
            )}
            {control.lastSyncedAt && (
              <span className="text-[11px] text-gray-400">
                synced {new Date(control.lastSyncedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
        )}

        {control.budgetExceeded && (
          <button
            type="button"
            className="w-fit rounded border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 transition hover:bg-amber-100 disabled:opacity-50"
            disabled={busy}
            onClick={() => {
              setRenewOpen(true);
              setTopUpAmount('');
            }}
          >
            + Add Budget
          </button>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1 text-xs text-gray-500">
            <input
              type="checkbox"
              className="cursor-pointer"
              checked={!control.cleanupDisabled}
              disabled={busy}
              onChange={(e) => void handleCleanupToggle(!e.target.checked)}
            />
            Auto cleanup
          </label>

          {!control.cleanupDisabled && effectiveInterval != null && (
            <button
              type="button"
              className="rounded border border-gray-200 bg-transparent px-2 py-0.5 text-[11px] text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              disabled={busy}
              onClick={() => {
                setCleanupOpen(true);
                setOverrideHours(
                  control.cleanupIntervalOverride?.toString() ??
                    control.defaultCleanupInterval?.toString() ??
                    ''
                );
              }}
            >
              Every {effectiveInterval}h
            </button>
          )}

          <button
            type="button"
            className="rounded border border-red-200 bg-transparent px-2 py-0.5 text-[11px] text-red-600 transition hover:bg-red-50 disabled:opacity-50"
            disabled={busy}
            onClick={() => void handleManualCleanup()}
          >
            {busy ? 'Cleaning...' : 'Clean now'}
          </button>
        </div>
      </div>

      {renewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setRenewOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-gray-900">Add Budget — {username}</h3>
            <p className="mt-1 text-sm text-gray-500">
              Current spend:{' '}
              <strong>${control.currentSpend.toFixed(2)}</strong> of{' '}
              <strong>${control.totalBudget!.toFixed(2)}</strong>
            </p>

            <label className="mt-4 block text-xs font-medium text-gray-700">
              Additional budget (USD)
            </label>
            <input
              type="number"
              min={1}
              step={0.01}
              placeholder="e.g. 50"
              value={topUpAmount}
              onChange={(e) => setTopUpAmount(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              autoFocus
            />
            {topUpAmount && (
              <p className="mt-1 text-xs text-emerald-600">
                New total budget: $
                {(control.totalBudget! + parseFloat(topUpAmount || '0')).toFixed(2)}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => setRenewOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-[var(--cloud-accent,#B91C1C)] px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
                disabled={!topUpAmount || busy}
                onClick={() => void handleRenewBudget()}
              >
                {busy ? 'Updating...' : 'Confirm Top-Up'}
              </button>
            </div>
          </div>
        </div>
      )}

      {cleanupOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setCleanupOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-gray-900">Cleanup Interval — {username}</h3>
            <p className="mt-1 text-sm text-gray-500">
              Default interval: every {control.defaultCleanupInterval ?? '—'}h
            </p>

            <label className="mt-4 block text-xs font-medium text-gray-700">
              Override interval (hours) — leave blank to use default
            </label>
            <input
              type="number"
              min={1}
              max={168}
              placeholder={`Default: ${control.defaultCleanupInterval ?? '—'}h`}
              value={overrideHours}
              onChange={(e) => setOverrideHours(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              autoFocus
            />

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => {
                  setOverrideHours('');
                  void handleSaveCleanupInterval(true);
                }}
              >
                Reset to default
              </button>
              <button
                type="button"
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => setCleanupOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-[var(--cloud-accent,#B91C1C)] px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
                disabled={busy}
                onClick={() => void handleSaveCleanupInterval(false)}
              >
                {busy ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface UseManageUserControlsResult {
  userControls: Record<number, ManagePortalUserControlData>;
  loadingAction: number | null;
  setLoadingAction: (userId: number | null) => void;
  updateControl: (userId: number, patch: Partial<ManagePortalUserControlData>) => void;
  refetchControls: () => Promise<void>;
}

export function useManageUserControls(
  session: ManagePortalSession | null,
  usersLoading = false
): UseManageUserControlsResult {
  const [userControls, setUserControls] = useState<Record<number, ManagePortalUserControlData>>({});
  const [loadingAction, setLoadingAction] = useState<number | null>(null);
  const [wasLoading, setWasLoading] = useState(false);

  const fetchControls = useCallback(async () => {
    if (!session || session.role !== 'admin') return;
    try {
      const map = await fetchManagePortalUserControls(session.requestId, session.sessionToken);
      setUserControls(map);
    } catch (err) {
      console.error('Failed to fetch user controls:', err);
    }
  }, [session]);

  useEffect(() => {
    void fetchControls();
  }, [fetchControls]);

  useEffect(() => {
    if (wasLoading && !usersLoading) {
      void fetchControls();
    }
    setWasLoading(usersLoading);
  }, [usersLoading, wasLoading, fetchControls]);

  const updateControl = useCallback((userId: number, patch: Partial<ManagePortalUserControlData>) => {
    setUserControls((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], ...patch },
    }));
  }, []);

  return {
    userControls,
    loadingAction,
    setLoadingAction,
    updateControl,
    refetchControls: fetchControls,
  };
}
