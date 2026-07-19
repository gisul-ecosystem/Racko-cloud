const express = require('express');
const {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead
} = require('../services/notificationService');
const { attachRackoUser } = require('../middleware/rackoUserMiddleware');

const router = express.Router();

router.use(attachRackoUser);

router.get('/notifications', async (req, res, next) => {
  try {
    const userId = req.rackoUser.userId;
    const { limit = 20, unreadOnly = false } = req.query;
    const notifications = await getNotifications(userId, {
      limit: Number(limit),
      unreadOnly: unreadOnly === 'true'
    });
    const unreadCount = await getUnreadCount(userId);
    res.json({ success: true, notifications, unreadCount });
  } catch (err) {
    next(err);
  }
});

router.patch('/notifications/read-all', async (req, res, next) => {
  try {
    const userId = req.rackoUser.userId;
    await markAllAsRead(userId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.patch('/notifications/:id/read', async (req, res, next) => {
  try {
    const userId = req.rackoUser.userId;
    await markAsRead(Number(req.params.id), userId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
