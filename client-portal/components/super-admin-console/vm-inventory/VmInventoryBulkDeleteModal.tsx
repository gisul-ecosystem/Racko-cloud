'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Trash2, X, XCircle } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import { deleteCatalogVm } from '@/lib/vmCatalogApi';
import { bulkDeleteInventoryServers } from '@/lib/vmInventoryApi';

/**
 * One selected VM, reduced to what a delete needs.
 *
 * Held apart from the table rows so a selection survives paging, and split by
 * kind because the two delete paths are different subsystems: `serverId` rows
 * are the inventory's own, `catalogVmId` rows belong to the VM catalog.
 */
export interface BulkDeleteTarget {
  ipAddress: string;
  serverId: string | null;
  catalogVmId: string | null;
  catalogQuantity: number | null;
}

/** A catalog purchase to delete, with the selected IPs that pointed at it. */
interface CatalogTarget {
  catalogVmId: string;
  ipAddresses: string[];
  quantity: number;
}

/** Catalog deletes run one at a time, so the batch is kept to a sane size. */
const MAX_CATALOG = 50;

/**
 * Delete a mixed selection of inventory and catalog VMs.
 *
 * Inventory servers go out in one bulk call. Catalog VMs are deleted one per
 * request at the purchase level — a purchase covering several machines takes
 * all of them, which this spells out before anything runs. Racko has no
 * terminate API for catalog VMs, so an operator confirms the machines are
 * already gone at the provider.
 */
export function VmInventoryBulkDeleteModal({
  targets,
  onClose,
  onDone,
}: {
  targets: BulkDeleteTarget[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failures, setFailures] = useState<string[]>([]);

  const serverIds = useMemo(
    () => targets.flatMap((t) => (t.serverId ? [t.serverId] : [])),
    [targets]
  );

  const catalog = useMemo<CatalogTarget[]>(() => {
    const byParent = new Map<string, CatalogTarget>();
    for (const t of targets) {
      if (t.serverId || !t.catalogVmId) continue;
      const existing = byParent.get(t.catalogVmId);
      if (existing) existing.ipAddresses.push(t.ipAddress);
      else {
        byParent.set(t.catalogVmId, {
          catalogVmId: t.catalogVmId,
          ipAddresses: [t.ipAddress],
          quantity: t.catalogQuantity ?? 1,
        });
      }
    }
    return [...byParent.values()];
  }, [targets]);

  /**
   * Machines a catalog delete takes beyond the ones ticked, because deletion is
   * per purchase. Zero when every machine in each purchase was selected.
   */
  const collateral = catalog.reduce(
    (sum, c) => sum + Math.max(0, c.quantity - c.ipAddresses.length),
    0
  );

  const tooManyCatalog = catalog.length > MAX_CATALOG;
  const blocked = (catalog.length > 0 && !confirmed) || tooManyCatalog;

  async function run() {
    setBusy(true);
    setError(null);
    setFailures([]);

    const notes: string[] = [];
    const failed: string[] = [];

    try {
      if (serverIds.length > 0) {
        setProgress(`Deleting ${serverIds.length} inventory VM(s)…`);
        const result = await bulkDeleteInventoryServers(serverIds);
        notes.push(`${result.deleted} inventory VM(s) deleted`);
        for (const s of result.skipped) {
          failed.push(`${s.ipAddress ?? s.serverId}: ${s.reason}`);
        }
      }
    } catch (err) {
      failed.push(
        `Inventory VMs: ${err instanceof ApiError ? err.message : 'delete failed'}`
      );
    }

    // Sequential: each call deletes a whole purchase and its portal mirrors,
    // and a partial failure is easier to report one at a time than in a race.
    let catalogDeleted = 0;
    let machinesDeleted = 0;
    for (const [index, target] of catalog.entries()) {
      setProgress(`Deleting catalog VM ${index + 1} of ${catalog.length}…`);
      try {
        const result = await deleteCatalogVm(target.catalogVmId, confirmed);
        catalogDeleted += 1;
        machinesDeleted += result.instancesDeleted;
      } catch (err) {
        failed.push(
          `${target.ipAddresses[0]}: ${err instanceof ApiError ? err.message : 'delete failed'}`
        );
      }
    }
    if (catalogDeleted > 0) {
      const machines =
        machinesDeleted > catalogDeleted ? ` (${machinesDeleted} machines)` : '';
      notes.push(`${catalogDeleted} catalog VM(s) deleted${machines}`);
    }

    setProgress(null);
    setBusy(false);

    if (notes.length === 0) {
      setError('Nothing was deleted.');
      setFailures(failed);
      return;
    }

    const tail = failed.length > 0 ? ` ${failed.length} failed or skipped.` : '';
    onDone(`${notes.join(', ')}.${tail}`);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
              <Trash2 className="h-4 w-4 text-[#B91C1C]" />
              Delete {targets.length} VM{targets.length === 1 ? '' : 's'}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {serverIds.length > 0
                ? `${serverIds.length} from the inventory`
                : 'None from the inventory'}
              {catalog.length > 0 ? ` · ${catalog.length} from the VM catalog` : ''}
            </p>
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

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {serverIds.length > 0 ? (
            <p className="text-sm text-gray-600">
              Inventory VMs lose their logins and assignments. Locked ones are skipped
              rather than blocking the batch.
            </p>
          ) : null}

          {catalog.length > 0 ? (
            <>
              <p className="text-sm text-gray-600">
                Catalog VMs are deleted per purchase, so each one leaves this inventory,
                its owner’s My VM list and the tenant portal together.
              </p>

              {collateral > 0 ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {collateral} machine{collateral === 1 ? '' : 's'} you did not select
                  will also go, because {collateral === 1 ? 'it shares' : 'they share'} a
                  purchase with one you did.
                </p>
              ) : null}

              {tooManyCatalog ? (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                  Catalog VMs are deleted one request at a time, capped at {MAX_CATALOG}{' '}
                  per batch. Narrow the selection.
                </p>
              ) : null}

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Racko cannot terminate catalog VMs for you
                </p>
                <p className="mt-1 text-xs text-amber-800">
                  They are fulfilled manually, so clearing the records here does not stop
                  the machines or their billing.
                </p>
                <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-amber-900">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    disabled={busy}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-amber-300 text-[#B91C1C] focus:ring-[#B91C1C]"
                  />
                  <span>
                    I have terminated {catalog.length === 1 ? 'this VM' : 'these VMs'} with
                    the provider
                  </span>
                </label>
              </div>
            </>
          ) : null}

          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="mb-1.5 text-xs font-medium text-gray-500">Selected IPs</p>
            <div className="max-h-32 overflow-y-auto font-mono text-xs text-gray-700">
              {targets.map((t) => (
                <p key={t.ipAddress}>{t.ipAddress}</p>
              ))}
            </div>
          </div>

          {progress ? (
            <p className="flex items-center gap-2 text-xs text-gray-600">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {progress}
            </p>
          ) : null}

          {error ? (
            <p
              className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700"
              role="alert"
            >
              <XCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          ) : null}

          {failures.length > 0 ? (
            <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-xs text-red-700">
              {failures.map((f) => (
                <p key={f}>{f}</p>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-5 py-3">
          <p className="flex items-center gap-1.5 text-xs text-gray-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            This cannot be undone
          </p>
          <div className="flex gap-2">
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
              onClick={() => void run()}
              disabled={busy || blocked}
              title={
                tooManyCatalog
                  ? `At most ${MAX_CATALOG} catalog VMs per batch`
                  : catalog.length > 0 && !confirmed
                    ? 'Confirm the catalog VMs are terminated at the provider first'
                    : undefined
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
