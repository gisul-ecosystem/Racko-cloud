'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, CheckCircle2, AlertCircle, Info, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../hooks/useNotifications';
import type { AppNotification, NotificationSeverity } from '../../lib/notificationApi';

const severityStyles: Record<
  NotificationSeverity,
  { icon: React.ReactNode; dot: string }
> = {
  info: { icon: <Info className="h-4 w-4" />, dot: 'bg-blue-500' },
  success: { icon: <CheckCircle2 className="h-4 w-4" />, dot: 'bg-green-500' },
  warning: { icon: <AlertCircle className="h-4 w-4" />, dot: 'bg-yellow-500' },
  error: { icon: <AlertCircle className="h-4 w-4" />, dot: 'bg-red-500' },
};

function formatRelativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function NotificationItem({
  notification,
  onOpen,
}: {
  notification: AppNotification;
  onOpen: (notification: AppNotification) => void;
}) {
  const style = severityStyles[notification.severity];

  return (
    <button
      type="button"
      onClick={() => onOpen(notification)}
      className={`flex w-full gap-3 px-4 py-3 text-left transition hover:bg-gray-50 ${
        notification.read ? 'opacity-80' : 'bg-red-50/30'
      }`}
    >
      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-gray-900">{notification.title}</span>
        <span className="mt-0.5 block text-xs text-gray-500">{notification.message}</span>
        <span className="mt-1 block text-[11px] text-gray-400">
          {formatRelativeTime(notification.createdAt)}
        </span>
      </span>
      {!notification.read && (
        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#B91C1C]" />
      )}
    </button>
  );
}

export function NotificationBell() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const { notifications, unreadCount, loading, error, markRead, markAllRead } =
    useNotifications(isAuthenticated);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
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

  async function handleOpenNotification(notification: AppNotification) {
    if (!notification.read) {
      try {
        await markRead(notification._id);
      } catch {
        // Navigation still proceeds if mark-read fails
      }
    }

    setOpen(false);

    if (notification.actionUrl) {
      router.push(notification.actionUrl);
      return;
    }

    if (notification.type === 'vm_plan_expired') {
      const tenantId = notification.metadata?.tenantId;
      if (typeof tenantId === 'string' && tenantId) {
        router.push(`/super-admin-console/white-labelling/tenants/${tenantId}`);
        return;
      }
    }

    if (notification.type === 'tenant_order') {
      router.push('/super-admin-console/white-labelling/orders');
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#B91C1C] px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg sm:w-96">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-semibold text-gray-900">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-xs font-medium text-[#B91C1C] hover:text-[#DC2626]"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </div>
            ) : error ? (
              <div className="px-4 py-10 text-center text-sm text-red-600">{error}</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-gray-500">No notifications yet</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {notifications.map((notification) => (
                  <NotificationItem
                    key={notification._id}
                    notification={notification}
                    onOpen={handleOpenNotification}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 px-4 py-2.5">
            <Link
              href="/dashboard/admin/jobs"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-gray-500 hover:text-[#B91C1C]"
            >
              View all jobs
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
