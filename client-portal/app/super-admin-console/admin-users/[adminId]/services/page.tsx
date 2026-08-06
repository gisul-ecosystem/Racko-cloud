'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  assignAdminService,
  fetchAdminServicesForUser,
  updateAdminServiceStatus,
  type AdminAssignedService,
  type AdminServiceCatalogItem,
  type AdminServiceKey,
} from '@/lib/adminServicesApi';
import { isServiceHiddenFromUi } from '@/lib/hiddenServices';
import { ErrorState } from '@/components/dashboard/ErrorState';

export default function AdminUserServicesPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const adminId = typeof params?.adminId === 'string' ? params.adminId : '';
  const email = searchParams.get('email') ?? '';

  const [catalog, setCatalog] = useState<AdminServiceCatalogItem[]>([]);
  const [services, setServices] = useState<AdminAssignedService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!adminId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminServicesForUser(adminId);
      setServices(data.services.filter((s) => !isServiceHiddenFromUi(s.serviceKey)));
      setCatalog(data.catalog.filter((item) => !isServiceHiddenFromUi(item.serviceKey)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load services.');
    } finally {
      setLoading(false);
    }
  }, [adminId]);

  useEffect(() => {
    void load();
  }, [load]);

  function statusFor(key: AdminServiceKey): 'active' | 'suspended' | 'none' {
    const found = services.find((s) => s.serviceKey === key);
    if (!found) return 'none';
    return found.status;
  }

  async function enable(key: AdminServiceKey) {
    setBusyKey(key);
    setError(null);
    try {
      const current = statusFor(key);
      if (current === 'none') {
        await assignAdminService(adminId, key);
      } else {
        await updateAdminServiceStatus(adminId, key, 'active');
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to enable service.');
    } finally {
      setBusyKey(null);
    }
  }

  async function suspend(key: AdminServiceKey) {
    setBusyKey(key);
    setError(null);
    try {
      await updateAdminServiceStatus(adminId, key, 'suspended');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to suspend service.');
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="mx-auto max-w-screen-lg space-y-6 p-6 lg:p-8">
      <div>
        <Link
          href="/super-admin-console/customers"
          className="mb-2 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#B91C1C]"
        >
          <ArrowLeft className="h-3 w-3" /> Back to admin users
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Admin services</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {email || adminId} — Billing is always available. Enable other services below.
        </p>
      </div>

      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
                <th className="px-5 py-3">Service</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {catalog.map((item) => {
                const st = statusFor(item.serviceKey);
                const busy = busyKey === item.serviceKey;
                return (
                  <tr key={item.serviceKey} className="border-b border-gray-50">
                    <td className="px-5 py-3.5 font-medium text-gray-900">{item.label}</td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          st === 'active'
                            ? 'bg-green-50 text-green-700'
                            : st === 'suspended'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {st === 'active' ? 'Active' : st === 'suspended' ? 'Suspended' : 'Not assigned'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="inline-flex gap-2">
                        {st !== 'active' ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void enable(item.serviceKey)}
                            className="rounded-md bg-[#B91C1C] px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            {busy ? '…' : 'Allow'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void suspend(item.serviceKey)}
                            className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-50"
                          >
                            {busy ? '…' : 'Suspend'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
