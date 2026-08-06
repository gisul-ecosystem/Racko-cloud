import { Router } from 'express';
import { resolveTenantContext } from '../../middleware/resolveTenantContext.middleware';
import { requireTenantAuth } from '../../middleware/requireTenantAuth.middleware';
import { requireTenantPermission } from '../../middleware/requireOrgPermission.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { orderController } from './order.controller';
import { createOrderSchema, quoteOrderSchema, tenantTemplateIdParamSchema } from './order.validation';

const router = Router();

router.use(resolveTenantContext);
router.use(requireTenantAuth);

router.get(
  '/templates',
  requireTenantPermission('orders.read', 'orders.create'),
  (req, res, next) => orderController.listTemplates(req, res, next)
);

router.get(
  '/templates/:templateId',
  requireTenantPermission('orders.read', 'orders.create'),
  validateRequest(tenantTemplateIdParamSchema),
  (req, res, next) => orderController.getTemplate(req, res, next)
);
router.post(
  '/quote',
  requireTenantPermission('orders.create'),
  validateRequest(quoteOrderSchema),
  (req, res, next) => orderController.quoteOrder(req, res, next)
);

router.post(
  '/',
  requireTenantPermission('orders.create'),
  validateRequest(createOrderSchema),
  (req, res, next) => orderController.createOrder(req, res, next)
);

router.get(
  '/',
  requireTenantPermission('orders.read'),
  (req, res, next) => orderController.listOrders(req, res, next)
);

export default router;
