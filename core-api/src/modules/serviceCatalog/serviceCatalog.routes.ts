import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requirePermission } from '../../middleware/requirePermission.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { serviceCatalogController } from './serviceCatalog.controller';
import {
  listServiceCatalogQuerySchema,
  patchServiceCatalogSchema,
} from './serviceCatalog.validation';

const router = Router();

/** Authenticated platform users: list catalog (SA pickers, org labels). */
router.get(
  '/',
  requireAuth,
  validateRequest(listServiceCatalogQuerySchema),
  (req, res, next) => {
    serviceCatalogController.list(req, res, next);
  }
);

/** Super-admin / staff with admin_users.manage: update label/status/sort (never key). */
router.patch(
  '/:key',
  requireAuth,
  requirePermission('admin_users.manage'),
  validateRequest(patchServiceCatalogSchema),
  (req, res, next) => {
    serviceCatalogController.patch(req, res, next);
  }
);

export default router;
