'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import { bulkUnassignInventoryServers, type VmInventoryRow } from '@/lib/vmInventoryApi';

/**
 * Releases every login on the selected VMs and hands the machines back to the
 * free pool, so they can be sold to a different tenant.
 *
 * Everything it will touch is counted before the operator commits, because the
 * lab users are deleted along with their grant. The VMs themselves are never
 * deleted — they only lose their owner.
 */
export function VmInventoryBulkUnassignModal({
  serverIds,
  rows,
  onClose,
  onApplied,
}: {
  /** Authoritative target list — a selection can outlive the visible page. */
  serverIds: string[];
  /** The selected rows currently loaded, used to preview the impact. */
  rows: VmInventoryRow[];
  onClose: () => void;
  onApplied: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = useMemo(() => {
    const assignments = rows.flatMap((r) => r.credentials.flatMap((c) => c.assignments));
    return {
      logins: assignments.length,
      // One person can hold several logins, and they are deleted once, not per grant.
      users: new Set(assignments.map((a) => a.assigneeId)).size,
      owned: rows.filter((r) => r.owner.tenantId || r.owner.adminId).length,
      /** Selected on a page that is no longer loaded, so not counted above. */
      unseen: serverIds.length - rows.length,
    };
  }, [rows, serverIds]);

  const apply = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await bulkUnassignInventoryServers(serverIds);
      const userNote =
        result.usersDeleted > 0
          ? ` Removed ${result.usersDeleted} portal user${result.usersDeleted === 1 ? '' : 's'}.`
          : '';
      onApplied(
        `Unassigned ${result.loginsUnassigned} login${
          result.loginsUnassigned === 1 ? '' : 's'
        }; freed ${result.serversFreed} VM${result.serversFreed === 1 ? '' : 's'}.${userNote}`
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not unassign these VMs.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Unassign &amp; free</h2>
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

          <ul className="space-y-1.5 text-sm text-gray-700">
            <li>
              <span className="font-medium">{plan.logins}</span> assigned login
              {plan.logins === 1 ? '' : 's'} will be released.
            </li>
            <li>
              <span className="font-medium">{plan.owned}</span> VM{plan.owned === 1 ? '' : 's'} will
              go back to the free pool, losing their owner and project.
            </li>
            {plan.users > 0 && (
              <li className="text-rose-700">
                <span className="font-medium">{plan.users}</span> portal user
                {plan.users === 1 ? '' : 's'} will be deleted, unless they still hold another VM
                somewhere.
              </li>
            )}
          </ul>

          <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
            Users lose access to these VMs immediately. The logins and passwords stay in the
            inventory, so the machines can be assigned to someone else.
          </div>

          {plan.unseen > 0 && (
            <p className="text-xs text-gray-500">
              {plan.unseen} more selected VM{plan.unseen === 1 ? '' : 's'} from another page{' '}
              {plan.unseen === 1 ? 'is' : 'are'} included but not counted above.
            </p>
          )}

          {plan.logins === 0 && plan.unseen === 0 && (
            <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-700 ring-1 ring-gray-200">
              Nothing is assigned on these VMs. This will just release the ones still holding an
              owner.
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
            Unassign &amp; free
          </button>
        </div>
      </div>
    </div>
  );
}
