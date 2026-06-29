'use client';

import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { formatCurrency } from '../../api/orgAdminClient';
import type { AwsOrgAdminRequestDetail } from '../../types/orgAdmin';

interface AwsOrgAdminBudgetTabProps {
  detail: AwsOrgAdminRequestDetail;
  saving: boolean;
  onRenewBudget: (userIndex: number, topUpAmount: number) => Promise<boolean>;
}

export function AwsOrgAdminBudgetTab({ detail, saving, onRenewBudget }: AwsOrgAdminBudgetTabProps) {
  const [renewUserIndex, setRenewUserIndex] = useState<number | null>(null);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [busyUserIndex, setBusyUserIndex] = useState<number | null>(null);

  async function handleRenew(userIndex: number) {
    const amount = parseFloat(topUpAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;

    setBusyUserIndex(userIndex);
    try {
      const ok = await onRenewBudget(userIndex, amount);
      if (ok) {
        setRenewUserIndex(null);
        setTopUpAmount('');
      }
    } finally {
      setBusyUserIndex(null);
    }
  }

  if (!detail.users?.length) {
    return (
      <div className="px-6 py-10 text-center text-sm text-gray-500">No users in this request.</div>
    );
  }

  return (
    <div className="space-y-4 px-2 py-2">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Budget Management</h3>
        <p className="mt-1 text-xs text-gray-500">
          Monitor AWS spend per user. Budget is enforced via Cost Explorer polling.
          {!detail.perUserBudgetUsd && ' No per-user budget set for this request.'}
        </p>
      </div>

      <div className="space-y-2.5">
        {detail.users.map((user) => {
          const budget = detail.perUserBudgetUsd || 0;
          const spent = user.currentSpend || 0;
          const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
          const renewing = renewUserIndex === user.userIndex;
          const busy = saving && busyUserIndex === user.userIndex;

          return (
            <div
              key={user.userIndex}
              className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3.5"
            >
              <span className="min-w-[140px] text-sm font-semibold text-gray-900">
                {user.username}
              </span>

              <div className="min-w-[200px] flex-1">
                <div className="mb-1.5 h-2 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className={`h-full rounded-full transition-all ${
                      pct >= 100 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                  <span>{formatCurrency(spent)} spent</span>
                  {budget > 0 && <span>of {formatCurrency(budget)}</span>}
                  {budget > 0 && <span className="ml-auto font-semibold text-gray-700">{pct}%</span>}
                </div>
              </div>

              <div>
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    user.budgetExceeded
                      ? 'bg-red-100 text-red-700'
                      : 'bg-green-100 text-green-700'
                  }`}
                >
                  {user.budgetExceeded ? 'Exceeded' : 'Within budget'}
                </span>
              </div>

              <div>
                {renewing ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={topUpAmount}
                      onChange={(event) => setTopUpAmount(event.target.value)}
                      placeholder="Amount USD"
                      className="w-28 rounded-lg border border-gray-200 px-2 py-1 text-xs focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleRenew(user.userIndex)}
                      className="rounded-lg bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-200 disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirm'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRenewUserIndex(null);
                        setTopUpAmount('');
                      }}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  user.budgetExceeded &&
                  budget > 0 && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setRenewUserIndex(user.userIndex)}
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 transition hover:bg-amber-100 disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Budget
                    </button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
