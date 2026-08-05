import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requirePermission } from '../../middleware/requirePermission.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { accountVmPricingController } from './accountVmPricing.controller';
import {
  overrideParamsSchema,
  providerParamSchema,
  searchAccountsSchema,
  upsertOverrideSchema,
} from './accountVmPricing.validation';

const router = Router();

router.use(requireAuth);

router.get(
  '/accounts',
  requirePermission('pricing.webyne.read', 'pricing.webyne.write'),
  validateRequest(searchAccountsSchema),
  (req, res, next) => {
    accountVmPricingController.searchAccounts(req, res, next);
  }
);

router.get(
  '/:provider/overrides',
  requirePermission('pricing.webyne.read', 'pricing.webyne.write'),
  validateRequest(providerParamSchema),
  (req, res, next) => {
    accountVmPricingController.listOverrides(req, res, next);
  }
);

router.get(
  '/:provider/overrides/:scopeType/:accountId',
  requirePermission('pricing.webyne.read', 'pricing.webyne.write'),
  validateRequest(overrideParamsSchema),
  (req, res, next) => {
    accountVmPricingController.getOverride(req, res, next);
  }
);

router.put(
  '/:provider/overrides/:scopeType/:accountId',
  requirePermission('pricing.webyne.write'),
  validateRequest(upsertOverrideSchema),
  (req, res, next) => {
    accountVmPricingController.upsertOverride(req, res, next);
  }
);

router.delete(
  '/:provider/overrides/:scopeType/:accountId',
  requirePermission('pricing.webyne.write'),
  validateRequest(overrideParamsSchema),
  (req, res, next) => {
    accountVmPricingController.deleteOverride(req, res, next);
  }
);

export default router;
