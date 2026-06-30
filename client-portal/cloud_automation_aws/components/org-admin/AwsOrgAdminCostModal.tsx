'use client';

import { X } from 'lucide-react';
import { formatCurrency } from '../../api/orgAdminClient';
import type { AwsOrgAdminUserCost } from '../../types/orgAdmin';

interface AwsOrgAdminCostModalProps {
  userIndex: number;
  cost: AwsOrgAdminUserCost;
  onClose: () => void;
}

export function AwsOrgAdminCostModal({ userIndex, cost, onClose }: AwsOrgAdminCostModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">AWS Cost Breakdown</h3>
            <p className="mt-0.5 text-sm text-gray-500">{cost.username || `labuser${userIndex + 1}`}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
              <p className="text-xs text-gray-500">Total spend</p>
              <p className="mt-0.5 font-semibold text-gray-900">{formatCurrency(cost.totalSpend)}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
              <p className="text-xs text-gray-500">Today</p>
              <p className="mt-0.5 font-semibold text-gray-900">{formatCurrency(cost.todaySpend)}</p>
            </div>
          </div>

          {cost.budgetUsd != null && cost.budgetUsd > 0 && (
            <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2.5 text-sm">
              <span className="text-violet-700">Budget: </span>
              <span className="font-semibold text-violet-900">{formatCurrency(cost.budgetUsd)}</span>
              {cost.budgetExceeded && (
                <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">
                  Exceeded
                </span>
              )}
            </div>
          )}

          <div>
            <h4 className="text-sm font-semibold text-gray-900">By service</h4>
            {cost.services?.length ? (
              <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-100">
                {cost.services.map((service) => (
                  <li
                    key={service.serviceName}
                    className="flex items-center justify-between px-3 py-2 text-sm"
                  >
                    <span className="text-gray-700">{service.serviceName}</span>
                    <span className="font-medium text-gray-900">
                      {formatCurrency(service.spendUsd)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-gray-500">No cost data available yet.</p>
            )}
          </div>

          {cost.syncedAt && (
            <p className="text-xs text-gray-400">
              Last synced {new Date(cost.syncedAt).toLocaleString()}
            </p>
          )}
        </div>

        <div className="border-t border-gray-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white hover:bg-[#a01717]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
