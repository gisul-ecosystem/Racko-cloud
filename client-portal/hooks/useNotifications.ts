'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from '../lib/notificationApi';
import { ApiError } from '../lib/apiClient';

const POLL_INTERVAL_MS = 30_000;

export function useNotifications(isAuthenticated: boolean) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      const [items, count] = await Promise.all([
        fetchNotifications(20),
        fetchUnreadNotificationCount(),
      ]);
      setNotifications(items);
      setUnreadCount(count);
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
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    void refetch();

    const id = setInterval(() => void refetch(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isAuthenticated, refetch]);

  const markRead = useCallback(async (notificationId: string) => {
    await markNotificationRead(notificationId);
    setNotifications((prev) =>
      prev.map((n) =>
        n._id === notificationId ? { ...n, read: true, readAt: new Date().toISOString() } : n
      )
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await markAllNotificationsRead();
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read: true, readAt: new Date().toISOString() }))
    );
    setUnreadCount(0);
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    refetch,
    markRead,
    markAllRead,
  };
}
