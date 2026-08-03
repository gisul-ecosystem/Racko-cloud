'use client';

import { useTenantAuth } from '@/context/TenantAuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function TenantProfilePage() {
  const { tenantUser } = useTenantAuth();
  const router = useRouter();

  useEffect(() => {
    if (tenantUser?.role === 'tenant_user') {
      router.replace('/console/dashboard/admin/vms');
    }
  }, [tenantUser, router]);

  if (tenantUser?.role !== 'tenant_admin') return null;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Profile</h1>
        <p className="text-sm text-gray-500">Your tenant admin account details.</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <dl className="space-y-4">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Email</dt>
            <dd className="mt-1 text-sm text-gray-900">{tenantUser.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Role</dt>
            <dd className="mt-1 text-sm capitalize text-gray-900">
              {tenantUser.role.replace('_', ' ')}
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-6">
        <h2 className="text-sm font-semibold text-gray-900">Change password</h2>
        <p className="mt-1 text-xs text-gray-500">
          Password change will be available once the tenant auth API supports it.
        </p>
        <form className="mt-4 space-y-3 opacity-50" aria-disabled="true">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Current password</label>
            <input
              type="password"
              disabled
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">New password</label>
            <input
              type="password"
              disabled
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            disabled
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-500"
          >
            Update password (coming soon)
          </button>
        </form>
      </div>
    </div>
  );
}
