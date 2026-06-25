'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { TableSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { listTenantNotifications, markTenantNotificationRead } from '@/lib/tenantPortalApi';
import { ApiError } from '@/lib/apiClient';
import type { TenantNotification } from '@/types/tenantPortal';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function notificationAction(notification: TenantNotification): { href: string; label: string } | null {
  if (notification.type === 'vm_plan_expiring_soon' && notification.metadata?.vmId) {
    return {
      href: `/tenant/dashboard/plans/${notification.metadata.vmId}`,
      label: 'Extend plan',
    };
  }
  return null;
}

export default function TenantNotificationsPage() {
  const { tenantUser } = useTenantAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<TenantNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tenantUser?.role === 'tenant_user') {
      router.replace('/tenant/dashboard/my-vms');
    }
  }, [tenantUser, router]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listTenantNotifications(1, 50);
      setNotifications(result.notifications);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantUser?.role === 'tenant_admin') void load();
  }, [tenantUser]);

  async function handleClick(notification: TenantNotification) {
    if (!notification.read) {
      try {
        await markTenantNotificationRead(notification.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
        );
      } catch {
        // still navigate if applicable
      }
    }
    const action = notificationAction(notification);
    if (action) router.push(action.href);
  }

  if (tenantUser?.role !== 'tenant_admin') return null;

  if (loading) return <TableSkeleton rows={6} cols={3} />;

  if (error) {
    return (
      <ErrorState title="Notifications unavailable" message={error} onRetry={() => void load()} />
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-gray-900">Notifications</h1>

      {notifications.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-500">
          No notifications yet.
        </p>
      ) : (
        <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {notifications.map((notification) => {
            const action = notificationAction(notification);
            return (
              <button
                key={notification.id}
                type="button"
                onClick={() => void handleClick(notification)}
                className={`flex w-full flex-col gap-2 px-5 py-4 text-left transition hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between ${
                  notification.read ? '' : 'bg-amber-50/40'
                }`}
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{notification.title}</p>
                  <p className="mt-0.5 text-sm text-gray-600">{notification.message}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    {formatDateTime(notification.createdAt)}
                  </p>
                </div>
                {action ? (
                  <span className="shrink-0 text-xs font-medium text-gray-700">{action.label} →</span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      <p className="text-xs text-gray-400">
        Plan expiry warnings are sent to tenant admins only.{' '}
        <Link href="/tenant/dashboard/plans" className="text-gray-600 underline">
          View VM plans
        </Link>
      </p>
    </div>
  );
}
