'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, Loader2, Trash2, X } from 'lucide-react';
import { ApiError } from '../../lib/apiClient';
import type { DeleteCatalogVmResult, ICatalogVm } from '../../lib/vmCatalogApi';

export type CatalogVmTermMode = 'extend' | 'delete';

/** Statuses where the machine may still exist, and still be billing, at the provider. */
const LIVE_STATUSES: ICatalogVm['status'][] = [
  'active',
  'provisioning',
  'fulfilling',
  'ready_to_attach',
];

function toDateInputValue(iso: string | undefined): string {
  const base = iso ? new Date(iso) : null;
  const valid = base && !Number.isNaN(base.getTime()) ? base : new Date();
  return valid.toISOString().slice(0, 10);
}

/** Hourly plans bill continuously, so they have no term that can lapse. */
function hasFixedTerm(billing: string): boolean {
  const b = billing.toLowerCase();
  return !b.includes('hour') && !b.includes('day');
}

function providerLabel(vm: ICatalogVm): string {
  // `provider` is stripped for non-super-admins, but this modal is super-admin only.
  if (!vm.provider) return 'the provider';
  return vm.provider === 'webyne' ? 'Webyne' : vm.provider.toUpperCase();
}

export function CatalogVmTermModal({
  vm,
  mode,
  onClose,
  onExtend,
  onDelete,
  onDone,
}: {
  vm: ICatalogVm;
  mode: CatalogVmTermMode;
  onClose: () => void;
  onExtend: (id: string, expiresAt: string) => Promise<ICatalogVm>;
  onDelete: (
    id: string,
    confirmTerminatedAtProvider: boolean
  ) => Promise<DeleteCatalogVmResult>;
  onDone: (message: string) => void;
}) {
  const [date, setDate] = useState(() => toDateInputValue(vm.expiresAt));
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The term belongs to the purchase, so acting on any row covers every VM in it.
  const targetId = vm.parentRequestId ?? vm._id;
  const instanceTotal = vm.instanceTotal ?? 1;
  const stillLive = LIVE_STATUSES.includes(vm.status);
  const provider = providerLabel(vm);

  const minDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const canSubmit =
    mode === 'extend'
      ? Boolean(date) && date > minDate
      : !stillLive || confirmed;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'extend') {
        // Send end-of-day so a date picked as "today + n" covers that whole day.
        await onExtend(targetId, new Date(`${date}T23:59:59.000Z`).toISOString());
        onDone(`Provider term extended to ${date}.`);
      } else {
        const result = await onDelete(targetId, confirmed);
        const scope =
          result.instancesDeleted > 1
            ? ` and its ${result.instancesDeleted} VMs`
            : '';
        onDone(`${result.planName}${scope} removed from Racko.`);
      }
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : `Could not ${mode} this VM.`
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
              {mode === 'extend' ? (
                <CalendarClock className="h-4 w-4 text-gray-500" />
              ) : (
                <Trash2 className="h-4 w-4 text-[#B91C1C]" />
              )}
              {mode === 'extend' ? 'Extend provider term' : 'Delete VM'}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {vm.planName}
              {instanceTotal > 1 ? ` · ${instanceTotal} VMs in this purchase` : ''}
              {vm.ipAddress ? ` · ${vm.ipAddress}` : ''}
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

        <div className="space-y-4 px-5 py-4">
          {mode === 'extend' ? (
            <>
              <p className="text-sm text-gray-600">
                Renew with {provider} first, then record the new end date here. Racko does
                not renew anything itself — this only updates the date it warns you about.
              </p>
              <div>
                <label
                  htmlFor="catalog-vm-expiry"
                  className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500"
                >
                  New end date
                </label>
                <input
                  id="catalog-vm-expiry"
                  type="date"
                  value={date}
                  min={minDate}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-[#B91C1C] focus:outline-none"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Current end date:{' '}
                  {vm.expiresAt ? vm.expiresAt.slice(0, 10) : 'not set'}
                </p>
                {!hasFixedTerm(vm.billing) ? (
                  <p className="mt-2 rounded-lg bg-gray-50 p-2.5 text-xs text-gray-600">
                    This VM is billed {vm.billing}, so it has no fixed term — it runs until
                    someone terminates it. Setting a date here just gives you a review
                    reminder on that day.
                  </p>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                This clears the Racko record: the VM disappears from My VM, from the VM
                inventory, and from{' '}
                {vm.adminEmail || vm.tenantId ? 'its owner’s portal' : 'any owner’s portal'}.
                {instanceTotal > 1
                  ? ` All ${instanceTotal} VMs in this purchase are removed together.`
                  : ''}
              </p>

              {stillLive ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Racko cannot terminate this VM for you
                  </p>
                  <p className="mt-1 text-xs text-amber-800">
                    {provider} has no terminate API here, so deleting the record does not
                    stop the machine or its billing. Terminate it on {provider} first.
                  </p>
                  <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-amber-900">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 rounded border-amber-300 text-[#B91C1C] focus:ring-[#B91C1C]"
                    />
                    <span>I have terminated this VM on {provider}</span>
                  </label>
                </div>
              ) : (
                <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
                  This VM is {vm.status.replace(/_/g, ' ')}, so nothing is running at the
                  provider. Safe to remove.
                </p>
              )}
            </>
          )}

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
            disabled={busy || !canSubmit}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
              mode === 'extend'
                ? 'bg-[#B91C1C] hover:bg-[#a01717]'
                : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {mode === 'extend' ? 'Save end date' : 'Delete VM'}
          </button>
        </div>
      </div>
    </div>
  );
}
