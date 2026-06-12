import { Router } from 'express';
import { notificationController } from './notification.controller';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import {
  listNotificationsSchema,
  notificationIdParamSchema,
} from './notification.validation';

const router = Router();

router.use(requireAuth);
router.use(requireRole('admin', 'super_admin'));

router.get(
  '/',
  validateRequest(listNotificationsSchema),
  (req, res, next) => notificationController.list(req, res, next)
);

router.get('/unread-count', (req, res, next) =>
  notificationController.unreadCount(req, res, next)
);

router.patch('/read-all', (req, res, next) =>
  notificationController.markAllRead(req, res, next)
);

router.patch(
  '/:notificationId/read',
  validateRequest(notificationIdParamSchema),
  (req, res, next) => notificationController.markRead(req, res, next)
);

export default router;
