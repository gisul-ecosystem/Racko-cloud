'use client';

import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import type { OrgAdminUser } from '../../types/orgAdmin';

interface OrgAdminBudgetTabProps {
  users: OrgAdminUser[];
  requestId: number;
  saving: boolean;
  onRenewBudget: (userId: number, topUpAmount: number) => Promise<boolean>;
}

export function OrgAdminBudgetTab({ users, saving, onRenewBudget }: OrgAdminBudgetTabProps) {
  const [renewUserId, setRenewUserId] = useState<number | null>(null);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [busyUserId, setBusyUserId] = useState<number | null>(null);

  async function handleRenew(userId: number) {
    const amount = parseFloat(topUpAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;

    setBusyUserId(userId);
    try {
      const ok = await onRenewBudget(userId, amount);
      if (ok) {
        setRenewUserId(null);
        setTopUpAmount('');
      }
    } finally {
      setBusyUserId(null);
    }
  }

  if (users.length === 0) {
    return (
      <div className="px-6 py-10 text-center text-sm text-gray-500">No users in this request.</div>
    );
  }

  return (
    <div className="space-y-2.5 px-6 py-5">
      {users.map((user) => {
        const spent = user.azureCostMtd ?? 0;
        const budget = user.totalBudget ?? 0;
        const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
        const renewing = renewUserId === user.id;
        const busy = saving && busyUserId === user.id;

        return (
          <div
            key={user.id}
            className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3.5"
          >
            <span className="min-w-[140px] text-sm font-semibold text-gray-900">{user.username}</span>

            <div className="min-w-[200px] flex-1">
              <div className="mb-1.5 h-2 overflow-hidden rounded-full bg-gray-200">
                <div
                  className={`h-full rounded-full transition-all ${
                    pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                <span>{formatCurrency(spent)} spent</span>
                {budget > 0 && <span>of {formatCurrency(budget)}</span>}
                <span className="ml-auto font-semibold text-gray-700">{pct}%</span>
              </div>
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
                    onClick={() => void handleRenew(user.id)}
                    className="rounded-lg bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-200 disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirm'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRenewUserId(null);
                      setTopUpAmount('');
                    }}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                user.budgetExceeded && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setRenewUserId(user.id)}
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
  );
}
