import { z } from 'zod';
import { Router } from 'express';
import { resolveTenantContext } from '../../middleware/resolveTenantContext.middleware';
import {
  requireTenantAuth,
  requireTenantRole,
} from '../../middleware/requireTenantAuth.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { orderController } from './order.controller';

const createOrderSchema = z.object({
  body: z.object({
    templateId: z.number().int().positive(),
    count: z.number().int().positive(),
  }),
});

const router = Router();

router.use(resolveTenantContext);
router.use(requireTenantAuth);
router.use(requireTenantRole('tenant_admin'));

router.get('/templates', (req, res, next) => orderController.listTemplates(req, res, next));

router.post(
  '/',
  validateRequest(createOrderSchema),
  (req, res, next) => orderController.createOrder(req, res, next)
);

router.get('/', (req, res, next) => orderController.listOrders(req, res, next));

export default router;
