import express from 'express';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from '../services/notificationService.js';

const router = express.Router();

router.get('/notifications', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'] || 'admin';
    const { limit = 20, unreadOnly = false } = req.query;
    const notifications = await getNotifications(userId, {
      limit: Number(limit),
      unreadOnly: unreadOnly === 'true',
    });
    const unreadCount = await getUnreadCount(userId);
    res.json({ success: true, notifications, unreadCount });
  } catch (err) {
    next(err);
  }
});

router.patch('/notifications/read-all', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'] || 'admin';
    await markAllAsRead(userId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.patch('/notifications/:id/read', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'] || 'admin';
    await markAsRead(req.params.id, userId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
