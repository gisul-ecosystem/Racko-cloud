import { Router } from 'express';
import { resolveTenantContext } from '../../middleware/resolveTenantContext.middleware';
import {
  requireTenantAuth,
  requireTenantRole,
} from '../../middleware/requireTenantAuth.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { tenantPlanController } from './tenantPlan.controller';
import { vmIdParamSchema } from './tenantPlan.validation';

const router = Router();

router.use(resolveTenantContext);
router.use(requireTenantAuth);
router.use(requireTenantRole('tenant_admin'));

router.get('/', (req, res, next) => tenantPlanController.listPlans(req, res, next));

router.get(
  '/:vmId',
  validateRequest(vmIdParamSchema),
  (req, res, next) => tenantPlanController.getPlan(req, res, next)
);

router.post(
  '/:vmId/quote',
  validateRequest(vmIdParamSchema),
  (req, res, next) => tenantPlanController.quotePlan(req, res, next)
);

router.post(
  '/:vmId/extend',
  validateRequest(vmIdParamSchema),
  (req, res, next) => tenantPlanController.extendPlan(req, res, next)
);

router.post(
  '/:vmId/renew',
  validateRequest(vmIdParamSchema),
  (req, res, next) => tenantPlanController.renewPlan(req, res, next)
);

router.get(
  '/:vmId/history',
  validateRequest(vmIdParamSchema),
  (req, res, next) => tenantPlanController.listHistory(req, res, next)
);

export default router;
