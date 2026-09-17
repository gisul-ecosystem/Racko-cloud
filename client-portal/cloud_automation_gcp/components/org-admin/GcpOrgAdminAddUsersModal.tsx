'use client';

import { useState } from 'react';
import { Loader2, UserPlus, X } from 'lucide-react';
import type { GcpOrgAdminRequestDetail } from '../../types/orgAdmin';

const MAX_ADD_PER_BATCH = 50;

export function GcpOrgAdminAddUsersModal({
  usersCount,
  request,
  submitting,
  onClose,
  onSubmit,
}: {
  usersCount: number;
  request: GcpOrgAdminRequestDetail | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (count: number) => Promise<void>;
}) {
  const [countInput, setCountInput] = useState('1');
  const [error, setError] = useState<string | null>(null);

  const parsedCount = Number.parseInt(countInput, 10);
  const currentAccountCount = Math.max(request?.accountCount ?? 0, usersCount);
  const nextAccountCount =
    Number.isInteger(parsedCount) && parsedCount > 0
      ? currentAccountCount + parsedCount
      : currentAccountCount + 1;

  const accessNote =
    request?.accessType === 'magic_link'
      ? 'Each user gets a new IAM lab role (magic link access), matching existing permissions.'
      : 'Each user gets a Direct IAM console login in the lab account, with the same baseline policies.';

  function validateCount(): number | null {
    if (!Number.isInteger(parsedCount) || parsedCount < 1) {
      setError('Account count must be a positive integer.');
      return null;
    }
    if (parsedCount > MAX_ADD_PER_BATCH) {
      setError(`You can add up to ${MAX_ADD_PER_BATCH} users at a time.`);
      return null;
    }
    setError(null);
    return parsedCount;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const count = validateCount();
    if (count == null) return;
    await onSubmit(count);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-xl"
        role="dialog"
        aria-labelledby="Gcp-add-users-title"
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 id="Gcp-add-users-title" className="text-base font-semibold text-gray-900">
              Add users
            </h3>
            <p className="mt-0.5 text-sm text-gray-500">
              Provision Gcp lab users and email credentials to the customer.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4 px-5 py-4">
          <div>
            <label htmlFor="Gcp-add-users-count" className="block text-sm font-medium text-gray-700">
              Account count
            </label>
            <input
              id="Gcp-add-users-count"
              type="number"
              min={1}
              max={MAX_ADD_PER_BATCH}
              step={1}
              value={countInput}
              onChange={(event) => {
                setCountInput(event.target.value);
                setError(null);
              }}
              disabled={submitting}
              className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C] disabled:bg-gray-50"
              autoFocus
            />
            <p className="mt-1.5 text-xs text-gray-500">
              Current users: {usersCount}
              {request?.accountCount != null ? ` · account count: ${request.accountCount}` : ''}.
              {Number.isInteger(parsedCount) && parsedCount > 0
                ? ` New account count: ${nextAccountCount}.`
                : null}
            </p>
            <p className="mt-1 text-xs text-gray-500">{accessNote}</p>
          </div>

          {error && (
            <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          {!request?.customerEmail && (
            <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              This request has no customer email — credentials cannot be emailed.
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !request?.customerEmail}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Create users
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
