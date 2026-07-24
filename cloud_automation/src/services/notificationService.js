const db = require('../db/postgres');

const NotificationType = {
  PROVISIONING_COMPLETE: 'provisioning_complete',
  PROVISIONING_FAILED: 'provisioning_failed',
  DAILY_LIMIT_REACHED: 'daily_limit_reached',
  BUDGET_EXCEEDED: 'budget_exceeded',
  CLEANUP_RAN: 'cleanup_ran',
  LAB_EXPIRING_SOON: 'lab_expiring_soon',
  LAB_EXPIRED: 'lab_expired',
  FORCE_LOGOUT: 'force_logout',
  ACCESS_REQUEST: 'access_request',
  ACCESS_REQUEST_REVIEWED: 'access_request_reviewed',
  PRIVILEGED_ROLE_REQUEST: 'privileged_role_request',
  PRIVILEGED_ROLE_REQUEST_REVIEWED: 'privileged_role_request_reviewed'
};

const SEVERITY_MAP = {
  provisioning_complete: 'success',
  provisioning_failed: 'error',
  daily_limit_reached: 'warning',
  budget_exceeded: 'error',
  cleanup_ran: 'info',
  lab_expiring_soon: 'warning',
  lab_expired: 'info',
  force_logout: 'warning',
  access_request: 'info',
  access_request_reviewed: 'success',
  privileged_role_request: 'info',
  privileged_role_request_reviewed: 'success'
};

function mapNotificationRow(row) {
  if (!row) return row;

  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    requestId: row.request_id,
    userId: row.user_id,
    severity: row.severity,
    read: row.read,
    createdAt: row.created_at,
    customer_email: row.customer_email
  };
}

async function createNotification({ type, title, message, requestId = null, userId = null }) {
  try {
    await db.query(
      `
        INSERT INTO notifications (type, title, message, request_id, user_id, severity, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `,
      [type, title, message, requestId, userId, SEVERITY_MAP[type] || 'info']
    );
  } catch (err) {
    console.error('[notifications] Failed to create:', err.message);
  }
}

async function getNotifications(userId, { limit = 20, unreadOnly = false } = {}) {
  const whereClause = unreadOnly
    ? 'WHERE (n.user_id = $1 OR n.user_id IS NULL) AND n.read = false'
    : 'WHERE (n.user_id = $1 OR n.user_id IS NULL)';

  const result = await db.query(
    `
      SELECT n.*, r.customer_email
      FROM notifications n
      LEFT JOIN requests r ON r.id = n.request_id
      ${whereClause}
      ORDER BY n.created_at DESC
      LIMIT $2
    `,
    [userId, limit]
  );

  return result.rows.map(mapNotificationRow);
}

async function getUnreadCount(userId) {
  const result = await db.query(
    `
      SELECT COUNT(*) as count FROM notifications
      WHERE (user_id = $1 OR user_id IS NULL) AND read = false
    `,
    [userId]
  );

  return parseInt(result.rows[0].count, 10);
}

async function markAsRead(notificationId, userId) {
  await db.query(
    `
      UPDATE notifications SET read = true
      WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)
    `,
    [notificationId, userId]
  );
}

async function markAllAsRead(userId) {
  await db.query(
    `
      UPDATE notifications SET read = true
      WHERE (user_id = $1 OR user_id IS NULL) AND read = false
    `,
    [userId]
  );
}

async function deleteOldNotifications() {
  await db.query(`
    DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '30 days'
  `);
}

module.exports = {
  NotificationType,
  createNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteOldNotifications
};
