import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import {
  requirePermission,
  requireRoleOrPermission,
} from '../../middleware/requirePermission.middleware';
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

router.use(requireAuth);

/** Catalog plans (DB-backed; not live scrape) */
router.get(
  '/plans',
  requireRoleOrPermission(['admin', 'super_admin'], 'pricing.webyne.read', 'pricing.webyne.write'),
  (req, res, next) => {
    vmCatalogPlanController.listPlans(req, res, next);
  }
);

router.post(
  '/plans',
  requirePermission('pricing.webyne.write'),
  validateRequest(createVmCatalogPlanSchema),
  (req, res, next) => {
    vmCatalogPlanController.createPlan(req, res, next);
  }
);

router.post('/plans/seed', requirePermission('pricing.webyne.write'), (req, res, next) => {
  vmCatalogPlanController.seedPlans(req, res, next);
});

router.patch(
  '/plans/:id',
  requirePermission('pricing.webyne.write'),
  validateRequest(updateVmCatalogPlanSchema),
  (req, res, next) => {
    vmCatalogPlanController.updatePlan(req, res, next);
  }
);

router.delete(
  '/plans/:id',
  requirePermission('pricing.webyne.write'),
  validateRequest(vmCatalogPlanIdParamSchema),
  (req, res, next) => {
    vmCatalogPlanController.deletePlan(req, res, next);
  }
);

/** Admin: overview + my VMs */
router.get(
  '/software-options',
  requireRole('admin', 'super_admin'),
  (req, res, next) => {
    vmCatalogController.listSoftwareOptions(req, res, next);
  }
);

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

/** Control plane: requester cards */
router.get(
  '/requests/requesters',
  requirePermission('webyne.requests.read'),
  (req, res, next) => {
    vmCatalogController.listRequesters(req, res, next);
  }
);

router.get(
  '/requests',
  requirePermission('webyne.requests.read'),
  validateRequest(listCatalogVmRequestsQuerySchema),
  (req, res, next) => {
    vmCatalogController.listRequests(req, res, next);
  }
);

router.patch(
  '/requests/:id/approve',
  requirePermission('webyne.requests.approve'),
  validateRequest(catalogVmRequestIdParamSchema),
  (req, res, next) => {
    vmCatalogController.approve(req, res, next);
  }
);

router.patch(
  '/requests/:id/fetch-details',
  requirePermission('webyne.requests.approve'),
  validateRequest(catalogVmRequestIdParamSchema),
  (req, res, next) => {
    vmCatalogController.fetchDetails(req, res, next);
  }
);

router.patch(
  '/requests/:id/attach',
  requirePermission('webyne.requests.attach'),
  validateRequest(catalogVmRequestIdParamSchema),
  (req, res, next) => {
    vmCatalogController.attach(req, res, next);
  }
);

router.patch(
  '/requests/:id/change-template',
  requirePermission('webyne.requests.attach'),
  validateRequest(changeCatalogVmTemplateSchema),
  (req, res, next) => {
    vmCatalogController.changeTemplate(req, res, next);
  }
);

router.post(
  '/requests/:id/power',
  requirePermission('webyne.requests.power'),
  validateRequest(catalogVmPowerActionSchema),
  (req, res, next) => {
    vmCatalogController.powerAction(req, res, next);
  }
);

router.patch(
  '/requests/:id/reject',
  requirePermission('webyne.requests.reject'),
  validateRequest(rejectCatalogVmRequestSchema),
  (req, res, next) => {
    vmCatalogController.reject(req, res, next);
  }
);

router.post(
  '/pricing/calculate',
  requirePermission('pricing.webyne.read'),
  validateRequest(calculateVmPricingSchema),
  (req, res, next) => {
    vmCatalogController.calculatePricing(req, res, next);
  }
);

router.get(
  '/pricing',
  requirePermission('pricing.webyne.read'),
  validateRequest(listVmPricingQuerySchema),
  (req, res, next) => {
    vmCatalogController.listPricing(req, res, next);
  }
);

export default router;
