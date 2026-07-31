'use client';

import { useState } from 'react';
import { Loader2, UserPlus, X } from 'lucide-react';
import type { OrgAdminRequestDetail } from '../../types/orgAdmin';

const MAX_ADD_PER_BATCH = 50;

interface OrgAdminAddUsersModalProps {
  usersCount: number;
  request: OrgAdminRequestDetail | null;
  isSharedCosting: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (count: number) => Promise<void>;
}

export function OrgAdminAddUsersModal({
  usersCount,
  request,
  isSharedCosting,
  submitting,
  onClose,
  onSubmit,
}: OrgAdminAddUsersModalProps) {
  const [countInput, setCountInput] = useState('1');
  const [error, setError] = useState<string | null>(null);

  const parsedCount = Number.parseInt(countInput, 10);

  const maxCount = MAX_ADD_PER_BATCH;

  const currentAccountCount = Math.max(request?.accountCount ?? 0, usersCount);
  const nextAccountCount =
    Number.isInteger(parsedCount) && parsedCount > 0
      ? currentAccountCount + parsedCount
      : currentAccountCount + 1;

  const rgNote = isSharedCosting
    ? 'Each user will join the shared resource group with the same roles as existing users.'
    : 'A dedicated resource group will be created for each user with the same roles and services.';

  function validateCount(): number | null {
    if (!Number.isInteger(parsedCount) || parsedCount < 1) {
      setError('Account count must be a positive integer.');
      return null;
    }

    if (parsedCount > maxCount) {
      setError(`You can add up to ${maxCount} users at a time.`);
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
        aria-labelledby="add-users-title"
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 id="add-users-title" className="text-base font-semibold text-gray-900">
              Add users
            </h3>
            <p className="mt-0.5 text-sm text-gray-500">
              Provision Azure accounts and email credentials to the customer.
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
            <label htmlFor="add-users-count" className="block text-sm font-medium text-gray-700">
              Account count
            </label>
            <input
              id="add-users-count"
              type="number"
              min={1}
              max={maxCount}
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
          </div>

          <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs text-blue-800">
            {rgNote}
            {request?.customerEmail ? (
              <>
                {' '}
                User ID, username, and temporary password will be emailed to{' '}
                <strong>{request.customerEmail}</strong>.
              </>
            ) : (
              <> User ID and temporary password will be emailed to the customer.</>
            )}
          </p>

          {!request?.customerEmail ? (
            <p className="text-sm text-red-600">
              This request has no customer email configured. Credentials cannot be sent.
            </p>
          ) : null}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !request?.customerEmail}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              {submitting ? 'Creating users…' : 'Create users'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
