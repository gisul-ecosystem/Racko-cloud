import { Router } from 'express';
import { resolveTenantContext } from '../../middleware/resolveTenantContext.middleware';
import {
  requireTenantAuth,
  requireTenantRole,
} from '../../middleware/requireTenantAuth.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { orderController } from './order.controller';
import { createOrderSchema, quoteOrderSchema, tenantTemplateIdParamSchema } from './order.validation';

const router = Router();

router.use(resolveTenantContext);
router.use(requireTenantAuth);
router.use(requireTenantRole('tenant_admin'));

router.get('/templates', (req, res, next) => orderController.listTemplates(req, res, next));

router.get(
  '/templates/:templateId',
  validateRequest(tenantTemplateIdParamSchema),
  (req, res, next) => orderController.getTemplate(req, res, next)
);
router.post(
  '/quote',
  validateRequest(quoteOrderSchema),
  (req, res, next) => orderController.quoteOrder(req, res, next)
);

router.post(
  '/',
  validateRequest(createOrderSchema),
  (req, res, next) => orderController.createOrder(req, res, next)
);

router.get('/', (req, res, next) => orderController.listOrders(req, res, next));

export default router;
