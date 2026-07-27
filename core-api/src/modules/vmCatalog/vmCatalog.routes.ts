import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { vmCatalogController } from './vmCatalog.controller';
import { vmCatalogPlanController } from './vmCatalogPlan.controller';
import {
  catalogVmRequestIdParamSchema,
  createCatalogVmRequestSchema,
  listCatalogVmRequestsQuerySchema,
  rejectCatalogVmRequestSchema,
  changeCatalogVmTemplateSchema,
  catalogVmPowerActionSchema,
  calculateVmPricingSchema,
  listVmPricingQuerySchema,
} from './vmCatalog.validation';
import {
  createVmCatalogPlanSchema,
  updateVmCatalogPlanSchema,
  vmCatalogPlanIdParamSchema,
} from './vmCatalogPlan.validation';

const router = Router();

// VM catalog routes (admin + super_admin)
router.use(requireAuth);

/** Catalog plans (DB-backed; not live scrape) */
router.get('/plans', requireRole('admin', 'super_admin'), (req, res, next) => {
  vmCatalogPlanController.listPlans(req, res, next);
});

router.post(
  '/plans',
  requireRole('super_admin'),
  validateRequest(createVmCatalogPlanSchema),
  (req, res, next) => {
    vmCatalogPlanController.createPlan(req, res, next);
  }
);

router.post('/plans/seed', requireRole('super_admin'), (req, res, next) => {
  vmCatalogPlanController.seedPlans(req, res, next);
});

router.patch(
  '/plans/:id',
  requireRole('super_admin'),
  validateRequest(updateVmCatalogPlanSchema),
  (req, res, next) => {
    vmCatalogPlanController.updatePlan(req, res, next);
  }
);

router.delete(
  '/plans/:id',
  requireRole('super_admin'),
  validateRequest(vmCatalogPlanIdParamSchema),
  (req, res, next) => {
    vmCatalogPlanController.deletePlan(req, res, next);
  }
);

/** Admin: overview + my VMs */
router.get('/overview', requireRole('admin', 'super_admin'), (req, res, next) => {
  vmCatalogController.overview(req, res, next);
});

router.get('/vms', requireRole('admin', 'super_admin'), (req, res, next) => {
  vmCatalogController.list(req, res, next);
});

router.get(
  '/vms/:id',
  requireRole('admin', 'super_admin'),
  validateRequest(catalogVmRequestIdParamSchema),
  (req, res, next) => {
    vmCatalogController.getOne(req, res, next);
  }
);

router.get(
  '/vms/:id/console',
  requireRole('admin', 'super_admin'),
  validateRequest(catalogVmRequestIdParamSchema),
  (req, res, next) => {
    vmCatalogController.openConsole(req, res, next);
  }
);

/** Admin: submit Buy Now request */
router.post(
  '/requests',
  requireRole('admin'),
  validateRequest(createCatalogVmRequestSchema),
  (req, res, next) => {
    vmCatalogController.createRequest(req, res, next);
  }
);

/** Super-admin: requester cards (must be before /requests/:id) */
router.get('/requests/requesters', requireRole('super_admin'), (req, res, next) => {
  vmCatalogController.listRequesters(req, res, next);
});

router.get(
  '/requests',
  requireRole('super_admin'),
  validateRequest(listCatalogVmRequestsQuerySchema),
  (req, res, next) => {
    vmCatalogController.listRequests(req, res, next);
  }
);

router.patch(
  '/requests/:id/approve',
  requireRole('super_admin'),
  validateRequest(catalogVmRequestIdParamSchema),
  (req, res, next) => {
    vmCatalogController.approve(req, res, next);
  }
);

router.patch(
  '/requests/:id/fetch-details',
  requireRole('super_admin'),
  validateRequest(catalogVmRequestIdParamSchema),
  (req, res, next) => {
    vmCatalogController.fetchDetails(req, res, next);
  }
);

router.patch(
  '/requests/:id/attach',
  requireRole('super_admin'),
  validateRequest(catalogVmRequestIdParamSchema),
  (req, res, next) => {
    vmCatalogController.attach(req, res, next);
  }
);

router.patch(
  '/requests/:id/change-template',
  requireRole('super_admin'),
  validateRequest(changeCatalogVmTemplateSchema),
  (req, res, next) => {
    vmCatalogController.changeTemplate(req, res, next);
  }
);

router.post(
  '/requests/:id/power',
  requireRole('super_admin'),
  validateRequest(catalogVmPowerActionSchema),
  (req, res, next) => {
    vmCatalogController.powerAction(req, res, next);
  }
);

router.patch(
  '/requests/:id/reject',
  requireRole('super_admin'),
  validateRequest(rejectCatalogVmRequestSchema),
  (req, res, next) => {
    vmCatalogController.reject(req, res, next);
  }
);

/** Super-admin: multi-cloud VM pricing calculator */
router.post(
  '/pricing/calculate',
  requireRole('super_admin'),
  validateRequest(calculateVmPricingSchema),
  (req, res, next) => {
    vmCatalogController.calculatePricing(req, res, next);
  }
);

router.get(
  '/pricing',
  requireRole('super_admin'),
  validateRequest(listVmPricingQuerySchema),
  (req, res, next) => {
    vmCatalogController.listPricing(req, res, next);
  }
);

export default router;
