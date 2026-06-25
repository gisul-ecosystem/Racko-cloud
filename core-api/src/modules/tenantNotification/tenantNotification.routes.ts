import { z } from 'zod';
import { Router } from 'express';
import { resolveTenantContext } from '../../middleware/resolveTenantContext.middleware';
import { requireTenantAuth } from '../../middleware/requireTenantAuth.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { tenantNotificationController } from './tenantNotification.controller';

const notificationIdSchema = z.object({
  params: z.object({
    notificationId: z.string().min(1),
  }),
});

const router = Router();

router.use(resolveTenantContext);
router.use(requireTenantAuth);

router.get('/', (req, res, next) => tenantNotificationController.list(req, res, next));

router.patch(
  '/:notificationId/read',
  validateRequest(notificationIdSchema),
  (req, res, next) => tenantNotificationController.markRead(req, res, next)
);

export default router;
