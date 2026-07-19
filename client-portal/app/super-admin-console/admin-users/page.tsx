'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2, XCircle, Loader2, Wallet, ArrowLeft, Users,
} from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/apiClient';
import { getAdminWalletByUserId } from '@/lib/adminBillingApi';

interface AdminUser {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  isEmailVerified: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

interface AdminUserWithWallet extends AdminUser {
  walletBalance: number | null;
  walletLoading: boolean;
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso?: string): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default function AdminUsersPage() {
  const [admins, setAdmins] = useState<AdminUserWithWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiRequest<{ success: boolean; data: { users: AdminUser[] } }>(
          '/api/v1/users'
        );
        const adminUsers = res.data.users.filter((u) => u.role === 'admin');

        // Init with loading wallet state
        setAdmins(adminUsers.map((u) => ({ ...u, walletBalance: null, walletLoading: true })));
        setLoading(false);

        // Fetch wallet balances in parallel
        const results = await Promise.allSettled(
          adminUsers.map((u) => getAdminWalletByUserId(u.id))
        );

        setAdmins(adminUsers.map((u, i) => ({
          ...u,
          walletBalance: results[i]?.status === 'fulfilled' ? results[i].value.balance : null,
          walletLoading: false,
        })));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load admin users.');
        setLoading(false);
      }
    }

    void load();
  }, []);

  return (
    <div className="mx-auto max-w-screen-xl space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/super-admin-console"
          className="mb-2 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#B91C1C]"
        >
          <ArrowLeft className="h-3 w-3" /> Back to console
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Admin Users</h1>
          {!loading && (
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
              {admins.length}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-gray-500">
          Active admins, wallet balances, billing, and service entitlements.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Admin cards */}
      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading admin users…
        </div>
      ) : admins.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center shadow-sm">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
            <Users className="h-6 w-6 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-600">No admin users found</p>
          <p className="mt-1 text-xs text-gray-400">Users with role &quot;admin&quot; will appear here.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {admins.map((admin) => (
            <div
              key={admin.id}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              {/* Card header */}
              <div className="flex items-start justify-between gap-2 mb-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">{admin.email}</p>
                  <p className="mt-0.5 font-mono text-xs text-gray-400">…{admin.id.slice(-10)}</p>
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                  admin.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {admin.isActive
                    ? <><CheckCircle2 className="h-3 w-3" />Active</>
                    : <><XCircle className="h-3 w-3" />Inactive</>
                  }
                </span>
              </div>

              {/* Details */}
              <dl className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <dt className="text-gray-500">Email verified</dt>
                  <dd className={admin.isEmailVerified ? 'font-medium text-green-600' : 'font-medium text-orange-500'}>
                    {admin.isEmailVerified ? 'Yes' : 'No'}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-gray-500">Last login</dt>
                  <dd className="text-gray-700">{formatDate(admin.lastLoginAt)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-gray-500">Joined</dt>
                  <dd className="text-gray-700">{formatDate(admin.createdAt)}</dd>
                </div>

                {/* Wallet */}
                <div className="flex items-center justify-between border-t border-gray-100 pt-2 mt-1">
                  <dt className="flex items-center gap-1 text-gray-500">
                    <Wallet className="h-3 w-3" />
                    Wallet balance
                  </dt>
                  <dd className="font-semibold text-gray-900">
                    {admin.walletLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
                    ) : admin.walletBalance !== null ? (
                      formatMoney(admin.walletBalance)
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
              </dl>

              {/* Action */}
              <div className="mt-4 flex flex-wrap gap-3 border-t border-gray-100 pt-3">
                <Link
                  href={`/super-admin-console/admin-users/${admin.id}/services?email=${encodeURIComponent(admin.email)}`}
                  className="text-xs font-medium text-[#B91C1C] hover:underline"
                >
                  Manage services →
                </Link>
                <Link
                  href={`/super-admin-console/vm-management/admin-wallets?userId=${admin.id}&email=${encodeURIComponent(admin.email)}`}
                  className="text-xs font-medium text-gray-600 hover:underline"
                >
                  Manage wallet →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
