'use client';

import { useCallback, useEffect, useState } from 'react';
import { listTenantNotifications, markTenantNotificationRead } from '@/lib/tenantPortalApi';
import { ApiError } from '@/lib/apiClient';
import type { TenantNotification } from '@/types/tenantPortal';

const POLL_INTERVAL_MS = 30_000;

export function useTenantNotifications(isAuthenticated: boolean, isTenantAdmin: boolean) {
  const [notifications, setNotifications] = useState<TenantNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const enabled = isAuthenticated && isTenantAdmin;

  const unreadCount = notifications.filter((n) => !n.read).length;

  const refetch = useCallback(async () => {
    if (!enabled) return;

    try {
      const result = await listTenantNotifications(1, 30);
      setNotifications(result.notifications);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status >= 500
            ? 'Notifications temporarily unavailable.'
            : err.message
          : 'Failed to load notifications.'
      );
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    void refetch();

    const id = setInterval(() => void refetch(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, refetch]);

  const markRead = useCallback(async (notificationId: string) => {
    await markTenantNotificationRead(notificationId);
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
    );
  }, []);

  return { notifications, unreadCount, loading, error, refetch, markRead };
}
