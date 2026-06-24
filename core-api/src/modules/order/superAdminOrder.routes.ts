import { z } from 'zod';
import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { superAdminOrderController } from './superAdminOrder.controller';

const listOrdersSchema = z.object({
  query: z.object({
    status: z
      .enum(['pending_payment', 'pending_approval', 'approved', 'provisioning', 'rejected', 'fulfilled'])
      .optional(),
  }),
});

const orderIdParamSchema = z.object({
  params: z.object({
    orderId: z.string().min(1),
  }),
});

const rejectOrderSchema = z.object({
  params: z.object({
    orderId: z.string().min(1),
  }),
  body: z.object({
    reason: z.string().min(1, 'reason is required').max(500),
  }),
});

const router = Router();

router.use(requireAuth);
router.use(requireRole('super_admin'));

router.get(
  '/',
  validateRequest(listOrdersSchema),
  (req, res, next) => superAdminOrderController.listOrders(req, res, next)
);

router.patch(
  '/:orderId/approve',
  validateRequest(orderIdParamSchema),
  (req, res, next) => superAdminOrderController.approveOrder(req, res, next)
);

router.patch(
  '/:orderId/reject',
  validateRequest(rejectOrderSchema),
  (req, res, next) => superAdminOrderController.rejectOrder(req, res, next)
);

export default router;
