import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { vmCatalogController } from './vmCatalog.controller';
import {
  catalogVmRequestIdParamSchema,
  createCatalogVmRequestSchema,
  listCatalogVmRequestsQuerySchema,
  rejectCatalogVmRequestSchema,
} from './vmCatalog.validation';

const router = Router();

// VM catalog routes (admin + super_admin)
router.use(requireAuth);

/** Admin: overview + my VMs */
router.get('/overview', requireRole('admin', 'super_admin'), (req, res, next) => {
  vmCatalogController.overview(req, res, next);
});

router.get('/vms', requireRole('admin', 'super_admin'), (req, res, next) => {
  vmCatalogController.list(req, res, next);
});

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
  '/requests/:id/reject',
  requireRole('super_admin'),
  validateRequest(rejectCatalogVmRequestSchema),
  (req, res, next) => {
    vmCatalogController.reject(req, res, next);
  }
);

export default router;
