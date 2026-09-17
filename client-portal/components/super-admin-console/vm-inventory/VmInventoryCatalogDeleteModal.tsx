'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import { deleteCatalogVm } from '@/lib/vmCatalogApi';
import type { VmInventoryRow } from '@/lib/vmInventoryApi';

/**
 * Remove a VM-catalog machine from Racko, whoever bought it.
 *
 * The inventory is the only place a super admin sees catalog VMs belonging to
 * platform admins and tenant admins — My VM lists just their own. Racko has no
 * terminate API for Webyne, so an operator has to confirm the machine is
 * already gone at the provider before the record can be cleared.
 */
export function VmInventoryCatalogDeleteModal({
  row,
  onClose,
  onDeleted,
}: {
  row: VmInventoryRow;
  onClose: () => void;
  onDeleted: (message: string) => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quantity = row.catalogQuantity ?? 1;
  const ownerLabel =
    row.owner.adminEmail ?? row.owner.tenantName ?? 'no one (unassigned)';

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  async function submit() {
    if (!row.catalogVmId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await deleteCatalogVm(row.catalogVmId, confirmed);
      const scope =
        result.instancesDeleted > 1 ? ` (${result.instancesDeleted} VMs)` : '';
      onDeleted(`${result.planName}${scope} removed from Racko.`);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not delete this catalog VM.'
      );
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
              <Trash2 className="h-4 w-4 text-[#B91C1C]" />
              Delete catalog VM
            </h2>
            <p className="mt-0.5 font-mono text-xs text-gray-500">{row.ipAddress}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
            <p>
              <span className="text-gray-500">Owned by</span> {ownerLabel}
            </p>
            {row.projectName ? (
              <p className="mt-1">
                <span className="text-gray-500">Project</span> {row.projectName}
                {row.clientName ? ` · ${row.clientName}` : ''}
              </p>
            ) : null}
          </div>

          <p className="text-sm text-gray-600">
            This clears the Racko record: the VM leaves this inventory, its owner’s My
            VM list, and the tenant portal.
            {quantity > 1
              ? ` This purchase covers ${quantity} machines and they are removed together.`
              : ''}
          </p>

          {quantity > 1 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Other IPs from the same purchase will disappear from the inventory too.
            </p>
          ) : null}

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
              <AlertTriangle className="h-3.5 w-3.5" />
              Racko cannot terminate this VM for you
            </p>
            <p className="mt-1 text-xs text-amber-800">
              Catalog VMs are fulfilled manually, so deleting the record here does not
              stop the machine or its billing. Terminate it with the provider first.
            </p>
            <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-amber-900">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 rounded border-amber-300 text-[#B91C1C] focus:ring-[#B91C1C]"
              />
              <span>I have terminated this VM with the provider</span>
            </label>
          </div>

          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Delete VM
          </button>
        </div>
      </div>
    </div>
  );
}
