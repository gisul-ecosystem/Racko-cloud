'use client';

import { useState } from 'react';
import {
  cleanupGcpLabUser,
  renewGcpLabUserBudget,
} from '../../../../cloud_automation_gcp/api/managePortalClient';

export default function BudgetCleanupCell({
  requestId,
  userIndex,
  jwtToken,
  user,
  portalData,
  onRefresh,
  onFeedback,
}) {
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [renewLoading, setRenewLoading] = useState(false);

  const budget = portalData.perUserBudgetUsd;
  const spend = user.spendUsd || 0;
  const cleanupEnabled = portalData.cleanupEnabled;
  const cleanupInterval = portalData.cleanupIntervalHours || 2;
  const budgetPct = budget > 0 ? Math.min((spend / budget) * 100, 100) : 0;

  async function handleCleanNow() {
    if (!window.confirm("Delete all Gcp resources inside this user's lab right now?")) {
      return;
    }

    setCleanupLoading(true);
    onFeedback?.(null);

    try {
      const data = await cleanupGcpLabUser(requestId, userIndex, jwtToken);
      const results = data.results || {};
      const errors = Object.entries(results).flatMap(([service, result]) => {
        if (result?.error) return [`${service}: ${result.error}`];
        return (result?.errors || []).map((error) => `${service}: ${error}`);
      });

      if (errors.length > 0) {
        throw new Error(errors.join('; '));
      }

      const metricLabels = {
        terminated: 'terminated',
        deleted: 'deleted',
        bucketsDeleted: 'bucket(s) deleted',
        notebooksDeleted: 'notebook(s) deleted',
        trainingJobsStopped: 'training job(s) stopped',
        instancesDeleted: 'instance(s) deleted',
        dbsDeleted: 'database(s) deleted',
      };
      const removed = Object.entries(results).flatMap(([service, result]) =>
        Object.entries(metricLabels)
          .filter(([metric]) => Number(result?.[metric] || 0) > 0)
          .map(([metric, label]) => `${result[metric]} ${service} ${label}`)
      );

      onFeedback?.(
        removed.length > 0
          ? `Cleanup complete — ${removed.join(', ')}.`
          : 'Cleanup complete — no matching resources were removed.'
      );
      onRefresh();
    } catch (err) {
      onFeedback?.(`Cleanup failed: ${err.message}`);
    } finally {
      setCleanupLoading(false);
    }
  }

  async function handleRenewBudget() {
    setRenewLoading(true);
    onFeedback?.(null);

    try {
      await renewGcpLabUserBudget(requestId, userIndex, jwtToken);
      onFeedback?.(`Budget renewed for ${user.username}.`);
      onRefresh();
    } catch (err) {
      onFeedback?.(`Renew failed: ${err.message}`);
    } finally {
      setRenewLoading(false);
    }
  }

  return (
    <div className="flex min-w-[220px] flex-col gap-1.5" onClick={(event) => event.stopPropagation()}>
      {budget != null ? (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-sm font-bold ${user.budgetExceeded ? 'text-red-600' : 'text-gray-900'}`}>
              ${spend.toFixed(4)}
            </span>
            <span className="text-xs text-gray-500">/ ${budget.toFixed(2)}</span>
          </div>

          <div className="mt-1.5">
            <div className="mb-0.5 h-1 overflow-hidden rounded bg-gray-200">
              <div
                className={`h-full rounded transition-[width] duration-300 ${
                  spend >= budget ? 'bg-[var(--cloud-accent,#B91C1C)]' : spend >= budget * 0.8 ? 'bg-amber-500' : 'bg-green-600'
                }`}
                style={{ width: `${budgetPct}%` }}
              />
            </div>
            <div className="text-[10px] text-gray-500">{budgetPct.toFixed(1)}% of budget used</div>
          </div>

          <div className="mt-1 text-[10px] text-gray-400">
            synced {new Date().toLocaleTimeString()}
          </div>

          {user.budgetExceeded && (
            <div className="mt-1.5 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-[var(--cloud-accent,#B91C1C)]">
              ⚠️ Budget exceeded — user suspended
            </div>
          )}
        </div>
      ) : (
        <span className="text-xs text-gray-400">No budget set</span>
      )}

      {user.budgetExceeded && (
        <button
          type="button"
          onClick={handleRenewBudget}
          disabled={renewLoading}
          className="w-fit rounded border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 transition hover:bg-amber-100 disabled:opacity-50"
        >
          {renewLoading ? 'Updating...' : 'Renew budget'}
        </button>
      )}

      {cleanupEnabled && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex cursor-default items-center gap-1 text-xs text-gray-500">
            <input type="checkbox" className="cursor-default" checked readOnly />
            Auto cleanup
          </label>

          <span className="rounded border border-gray-200 bg-transparent px-2 py-0.5 text-[11px] text-gray-700">
            Every {cleanupInterval}h
          </span>

          <button
            type="button"
            onClick={handleCleanNow}
            disabled={cleanupLoading}
            className="rounded border border-red-200 bg-transparent px-2 py-0.5 text-[11px] text-red-600 transition hover:bg-red-50 disabled:opacity-50"
          >
            {cleanupLoading ? 'Cleaning...' : 'Clean now'}
          </button>
        </div>
      )}
    </div>
  );
}
