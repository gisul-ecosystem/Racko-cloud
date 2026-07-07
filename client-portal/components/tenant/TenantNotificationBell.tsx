'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Bell, Info, Loader2 } from 'lucide-react';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { useTenantNotifications } from '@/hooks/useTenantNotifications';
import { tenantAccentButton } from '@/lib/tenantAccentStyles';
import type { TenantNotification } from '@/types/tenantPortal';

function formatRelativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function notificationHref(notification: TenantNotification): string | null {
  if (notification.type === 'vm_plan_expiring_soon' && notification.metadata?.vmId) {
    return `/tenant/dashboard/plans/${notification.metadata.vmId}`;
  }
  return null;
}

function NotificationItem({
  notification,
  onOpen,
}: {
  notification: TenantNotification;
  onOpen: (notification: TenantNotification) => void;
}) {
  const Icon = notification.severity === 'warning' ? AlertCircle : Info;

  return (
    <button
      type="button"
      onClick={() => onOpen(notification)}
      className={`flex w-full gap-3 px-4 py-3 text-left transition hover:bg-gray-50 ${
        notification.read ? 'opacity-80' : 'bg-amber-50/40'
      }`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-gray-900">{notification.title}</span>
        <span className="mt-0.5 block text-xs text-gray-500">{notification.message}</span>
        <span className="mt-1 block text-[11px] text-gray-400">
          {formatRelativeTime(notification.createdAt)}
        </span>
      </span>
      {!notification.read && (
        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
      )}
    </button>
  );
}

export function TenantNotificationBell() {
  const { isAuthenticated, tenantUser } = useTenantAuth();
  const { accentColor } = useTenantBranding();
  const router = useRouter();
  const isAdmin = tenantUser?.role === 'tenant_admin';
  const { notifications, unreadCount, loading, error, markRead } = useTenantNotifications(
    isAuthenticated,
    isAdmin
  );
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  if (!isAdmin) return null;

  async function handleOpenNotification(notification: TenantNotification) {
    if (!notification.read) {
      try {
        await markRead(notification.id);
      } catch {
        // continue navigation
      }
    }
    setOpen(false);
    const href = notificationHref(notification);
    if (href) router.push(href);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
            style={tenantAccentButton(accentColor)}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg sm:w-96">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-semibold text-gray-900">Notifications</p>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : error ? (
              <div className="px-4 py-10 text-center text-sm text-red-600">{error}</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-gray-500">No notifications yet</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {notifications.slice(0, 8).map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onOpen={handleOpenNotification}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 px-4 py-2.5">
            <Link
              href="/tenant/dashboard/notifications"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-gray-600 hover:text-gray-900"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
