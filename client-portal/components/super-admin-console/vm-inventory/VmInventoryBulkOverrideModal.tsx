'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import { bulkSetInventoryOverride } from '@/lib/vmInventoryApi';

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20';

/**
 * Grants or clears the client-date override on every active assignment of the
 * selected VMs, so an extended engagement does not need a per-login edit.
 */
export function VmInventoryBulkOverrideModal({
  serverIds,
  onClose,
  onApplied,
}: {
  serverIds: string[];
  onClose: () => void;
  onApplied: (message: string) => void;
}) {
  const [grant, setGrant] = useState(true);
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await bulkSetInventoryOverride({
        serverIds,
        accessOverride: grant,
        // An expiry only means something while the override is on.
        accessOverrideUntil: grant && until ? new Date(until).toISOString() : null,
      });
      const skipNote =
        result.serversWithoutAssignments > 0
          ? ` ${result.serversWithoutAssignments} VM${
              result.serversWithoutAssignments === 1 ? '' : 's'
            } had no assignment to change.`
          : '';
      onApplied(
        `${grant ? 'Granted' : 'Removed'} override on ${result.updated} assignment${
          result.updated === 1 ? '' : 's'
        } across ${result.servers} VM${result.servers === 1 ? '' : 's'}.${skipNote}`
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change the override.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Access override</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {serverIds.length} VM{serverIds.length === 1 ? '' : 's'} selected
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {[
              { value: true, label: 'Grant override' },
              { value: false, label: 'Remove override' },
            ].map((option) => (
              <button
                key={String(option.value)}
                type="button"
                onClick={() => setGrant(option.value)}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  grant === option.value
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {grant ? (
            <>
              <div>
                <label
                  className="mb-1.5 block text-sm font-medium text-gray-700"
                  htmlFor="overrideUntil"
                >
                  Expires (optional)
                </label>
                <input
                  id="overrideUntil"
                  type="datetime-local"
                  className={inputClass}
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                />
                <p className="mt-1.5 text-xs text-gray-500">
                  Leave empty for an override with no end. Must be in the future.
                </p>
              </div>
              <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
                Every user assigned to these VMs keeps access even after their project end date.
              </div>
            </>
          ) : (
            <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-700 ring-1 ring-gray-200">
              Access goes back to following each project&apos;s start and end dates.
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void apply()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#991B1B] disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {grant ? 'Grant override' : 'Remove override'}
          </button>
        </div>
      </div>
    </div>
  );
}
