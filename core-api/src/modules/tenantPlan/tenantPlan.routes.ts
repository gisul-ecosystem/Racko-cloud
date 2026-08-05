import { Router } from 'express';
import { resolveTenantContext } from '../../middleware/resolveTenantContext.middleware';
import { requireTenantAuth } from '../../middleware/requireTenantAuth.middleware';
import { requireTenantPermission } from '../../middleware/requireOrgPermission.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { tenantPlanController } from './tenantPlan.controller';
import { vmIdParamSchema } from './tenantPlan.validation';

const router = Router();

router.use(resolveTenantContext);
router.use(requireTenantAuth);

router.get(
  '/',
  requireTenantPermission('orders.read', 'wallet.read'),
  (req, res, next) => tenantPlanController.listPlans(req, res, next)
);

router.get(
  '/:vmId',
  requireTenantPermission('orders.read', 'wallet.read'),
  validateRequest(vmIdParamSchema),
  (req, res, next) => tenantPlanController.getPlan(req, res, next)
);

router.post(
  '/:vmId/quote',
  requireTenantPermission('orders.create', 'wallet.topup'),
  validateRequest(vmIdParamSchema),
  (req, res, next) => tenantPlanController.quotePlan(req, res, next)
);

router.post(
  '/:vmId/extend',
  requireTenantPermission('orders.create', 'wallet.topup'),
  validateRequest(vmIdParamSchema),
  (req, res, next) => tenantPlanController.extendPlan(req, res, next)
);

router.post(
  '/:vmId/renew',
  requireTenantPermission('orders.create', 'wallet.topup'),
  validateRequest(vmIdParamSchema),
  (req, res, next) => tenantPlanController.renewPlan(req, res, next)
);

router.get(
  '/:vmId/history',
  requireTenantPermission('orders.read', 'wallet.read'),
  validateRequest(vmIdParamSchema),
  (req, res, next) => tenantPlanController.listHistory(req, res, next)
);

export default router;
