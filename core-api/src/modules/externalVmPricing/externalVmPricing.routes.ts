import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requirePermission } from '../../middleware/requirePermission.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { externalVmPricingController } from './externalVmPricing.controller';
import {
  providerParamSchema,
  saveExternalVmPricingSchema,
} from './externalVmPricing.validation';

const router = Router();

router.use(requireAuth);

/**
 * GET  /api/v1/external-vm-pricing/:provider
 * PUT  /api/v1/external-vm-pricing/:provider
 * Control-plane: permission-gated (super_admin bypasses).
 */
router.get(
  '/:provider',
  requirePermission('pricing.webyne.read', 'pricing.webyne.write'),
  validateRequest(providerParamSchema),
  (req, res, next) => {
    externalVmPricingController.getConfig(req, res, next);
  }
);

router.put(
  '/:provider',
  requirePermission('pricing.webyne.write', 'pricing.hourly.toggle'),
  validateRequest(saveExternalVmPricingSchema),
  (req, res, next) => {
    externalVmPricingController.saveConfig(req, res, next);
  }
);

export default router;
