import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
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
 * Readable by super_admin only (sell pricing is applied server-side for admins).
 *
 * PUT  /api/v1/external-vm-pricing/:provider
 * Writable by super_admin only.
 */
router.get(
  '/:provider',
  requireRole('super_admin'),
  validateRequest(providerParamSchema),
  (req, res, next) => {
    externalVmPricingController.getConfig(req, res, next);
  }
);

router.put(
  '/:provider',
  requireRole('super_admin'),
  validateRequest(saveExternalVmPricingSchema),
  (req, res, next) => {
    externalVmPricingController.saveConfig(req, res, next);
  }
);

export default router;
