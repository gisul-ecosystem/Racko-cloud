import { apiRequest } from './apiClient';

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';

export type NotificationType =
  | 'vm_job'
  | 'tenant_order'
  | 'vm_plan_expired'
  | 'catalog_vm_request';

export interface AppNotification {
  _id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  severity: NotificationSeverity;
  read: boolean;
  readAt?: string;
  metadata?: Record<string, unknown>;
  actionUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export async function fetchNotifications(
  limit = 20,
  unreadOnly = false
): Promise<AppNotification[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (unreadOnly) params.set('unreadOnly', 'true');

  const res = await apiRequest<ApiResponse<{ notifications: AppNotification[] }>>(
    `/api/v1/notifications?${params.toString()}`
  );
  return res.data.notifications;
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const res = await apiRequest<ApiResponse<{ count: number }>>(
    '/api/v1/notifications/unread-count'
  );
  return res.data.count;
}

export async function markNotificationRead(notificationId: string): Promise<AppNotification> {
  const res = await apiRequest<ApiResponse<{ notification: AppNotification }>>(
    `/api/v1/notifications/${notificationId}/read`,
    { method: 'PATCH' }
  );
  return res.data.notification;
}

export async function markAllNotificationsRead(): Promise<number> {
  const res = await apiRequest<ApiResponse<{ updated: number }>>(
    '/api/v1/notifications/read-all',
    { method: 'PATCH' }
  );
  return res.data.updated;
}
