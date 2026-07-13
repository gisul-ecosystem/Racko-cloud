import Notification from '../models/Notification.js';

const SEVERITY_MAP = {
  provisioning_complete: 'success',
  provisioning_failed: 'error',
  budget_exceeded: 'error',
  cleanup_ran: 'info',
  lab_expiring_soon: 'warning',
  lab_expired: 'info',
  console_access: 'info',
  budget_renewed: 'success',
  user_suspended: 'warning',
  user_reinstated: 'success',
};

function mapNotification(doc) {
  const notification = doc.toObject ? doc.toObject() : doc;

  return {
    id: String(notification._id),
    type: notification.type,
    title: notification.title,
    message: notification.message,
    requestId: notification.requestId,
    userId: notification.userId,
    severity: notification.severity,
    read: notification.read,
    metadata: notification.metadata,
    createdAt: notification.createdAt,
  };
}

export async function createNotification({
  type,
  title,
  message,
  requestId = null,
  userId = null,
  metadata = null,
}) {
  try {
    await Notification.create({
      type,
      title,
      message,
      requestId,
      userId,
      severity: SEVERITY_MAP[type] || 'info',
      metadata,
    });
  } catch (err) {
    console.error('[notifications] Failed to create:', err.message);
  }
}

export async function getNotifications(userId, { limit = 20, unreadOnly = false } = {}) {
  const query = { $or: [{ userId }, { userId: null }] };
  if (unreadOnly) query.read = false;

  const notifications = await Notification.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('requestId', 'customerEmail region status');

  return notifications.map(mapNotification);
}

export async function getUnreadCount(userId) {
  return Notification.countDocuments({
    $or: [{ userId }, { userId: null }],
    read: false,
  });
}

export async function markAsRead(notificationId, userId) {
  const result = await Notification.findOneAndUpdate(
    {
      _id: notificationId,
      $or: [{ userId }, { userId: null }],
    },
    { read: true },
    { new: true }
  );

  if (!result) {
    const error = new Error('Notification not found');
    error.statusCode = 404;
    throw error;
  }

  return result;
}

export async function markAllAsRead(userId) {
  await Notification.updateMany(
    { $or: [{ userId }, { userId: null }], read: false },
    { $set: { read: true } }
  );
}
