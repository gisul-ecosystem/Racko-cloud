'use client';

import { useState } from 'react';
import {
  cleanupAwsLabUser,
  renewAwsLabUserBudget,
} from '../../../../cloud_automation_aws/api/managePortalClient';

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

  async function handleCleanNow() {
    if (!window.confirm("Delete all AWS resources inside this user's lab right now?")) {
      return;
    }

    setCleanupLoading(true);
    onFeedback?.(null);

    try {
      const data = await cleanupAwsLabUser(requestId, userIndex, jwtToken);
      const count = data.results?.ec2Terminated || 0;
      const rdsCount = data.results?.rdsDeleted || 0;
      onFeedback?.(
        `Cleanup complete — ${count} EC2 terminated${rdsCount ? `, ${rdsCount} RDS deleted` : ''}.`
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
      await renewAwsLabUserBudget(requestId, userIndex, jwtToken);
      onFeedback?.(`Budget renewed for ${user.username}.`);
      onRefresh();
    } catch (err) {
      onFeedback?.(`Renew failed: ${err.message}`);
    } finally {
      setRenewLoading(false);
    }
  }

  return (
    <div className="flex min-w-[220px] flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
      {budget != null ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`text-xs font-medium ${
              user.budgetExceeded ? 'text-red-600' : 'text-gray-700'
            }`}
          >
            ${spend.toFixed(2)} / ${budget.toFixed(2)}
          </span>
          {user.budgetExceeded && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-600">
              Exceeded
            </span>
          )}
          <span className="text-[11px] text-gray-400">
            synced {new Date().toLocaleTimeString()}
          </span>
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
