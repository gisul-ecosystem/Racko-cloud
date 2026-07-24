import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { dedicatedServerController } from './dedicatedServer.controller';
import {
  attachDedicatedRequestSchema,
  createDedicatedPlanSchema,
  createDedicatedRequestSchema,
  dedicatedIdParamSchema,
  listDedicatedRequestsQuerySchema,
  rejectDedicatedRequestSchema,
  updateDedicatedPlanSchema,
  updateDedicatedPricingSettingsSchema,
} from './dedicatedServer.validation';

const router = Router();

router.use(requireAuth);

/** Plans — admin sees active; super_admin sees all */
router.get('/plans', requireRole('admin', 'super_admin'), (req, res, next) => {
  dedicatedServerController.listPlans(req, res, next);
});

router.post(
  '/plans',
  requireRole('super_admin'),
  validateRequest(createDedicatedPlanSchema),
  (req, res, next) => {
    dedicatedServerController.createPlan(req, res, next);
  }
);

router.patch(
  '/plans/:id',
  requireRole('super_admin'),
  validateRequest(updateDedicatedPlanSchema),
  (req, res, next) => {
    dedicatedServerController.updatePlan(req, res, next);
  }
);

router.delete(
  '/plans/:id',
  requireRole('super_admin'),
  validateRequest(dedicatedIdParamSchema),
  (req, res, next) => {
    dedicatedServerController.deletePlan(req, res, next);
  }
);

router.post('/plans/seed', requireRole('super_admin'), (req, res, next) => {
  dedicatedServerController.seedPlans(req, res, next);
});

router.get('/pricing-settings', requireRole('super_admin'), (req, res, next) => {
  dedicatedServerController.getPricingSettings(req, res, next);
});

router.put(
  '/pricing-settings',
  requireRole('super_admin'),
  validateRequest(updateDedicatedPricingSettingsSchema),
  (req, res, next) => {
    dedicatedServerController.updatePricingSettings(req, res, next);
  }
);

/** Admin: my servers */
router.get('/servers', requireRole('admin', 'super_admin'), (req, res, next) => {
  dedicatedServerController.listMine(req, res, next);
});

router.get(
  '/servers/:id',
  requireRole('admin', 'super_admin'),
  validateRequest(dedicatedIdParamSchema),
  (req, res, next) => {
    dedicatedServerController.getOne(req, res, next);
  }
);

router.get(
  '/servers/:id/console',
  requireRole('admin', 'super_admin'),
  validateRequest(dedicatedIdParamSchema),
  (req, res, next) => {
    dedicatedServerController.openConsole(req, res, next);
  }
);

router.post(
  '/requests',
  requireRole('admin'),
  validateRequest(createDedicatedRequestSchema),
  (req, res, next) => {
    dedicatedServerController.createRequest(req, res, next);
  }
);

/** Super-admin inbox */
router.get('/requests/requesters', requireRole('super_admin'), (req, res, next) => {
  dedicatedServerController.listRequesters(req, res, next);
});

router.get(
  '/requests',
  requireRole('super_admin'),
  validateRequest(listDedicatedRequestsQuerySchema),
  (req, res, next) => {
    dedicatedServerController.listRequests(req, res, next);
  }
);

router.patch(
  '/requests/:id/attach',
  requireRole('super_admin'),
  validateRequest(attachDedicatedRequestSchema),
  (req, res, next) => {
    dedicatedServerController.attach(req, res, next);
  }
);

router.patch(
  '/requests/:id/reject',
  requireRole('super_admin'),
  validateRequest(rejectDedicatedRequestSchema),
  (req, res, next) => {
    dedicatedServerController.reject(req, res, next);
  }
);

export default router;
