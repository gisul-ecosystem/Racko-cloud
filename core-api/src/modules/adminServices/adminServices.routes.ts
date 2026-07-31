import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { requirePermission } from '../../middleware/requirePermission.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { adminServicesController } from './adminServices.controller';
import {
  adminIdParamSchema,
  adminServiceKeyParamSchema,
  assignAdminServiceSchema,
  updateAdminServiceSchema,
} from './adminServices.validation';

const router = Router();

/** Logged-in admin: my entitlements */
router.get('/me', requireAuth, requireRole('admin'), (req, res, next) => {
  adminServicesController.listMine(req, res, next);
});

/** Super-admin management */
router.get(
  '/catalog',
  requireAuth,
  requirePermission('admin_users.manage'),
  (req, res, next) => {
    adminServicesController.listCatalog(req, res, next);
  }
);

router.get(
  '/admins/:adminId',
  requireAuth,
  requirePermission('admin_users.manage'),
  validateRequest(adminIdParamSchema),
  (req, res, next) => {
    adminServicesController.listForAdmin(req, res, next);
  }
);

router.post(
  '/admins/:adminId',
  requireAuth,
  requirePermission('admin_users.manage'),
  validateRequest(assignAdminServiceSchema),
  (req, res, next) => {
    adminServicesController.assign(req, res, next);
  }
);

router.patch(
  '/admins/:adminId/:serviceKey',
  requireAuth,
  requirePermission('admin_users.manage'),
  validateRequest(updateAdminServiceSchema),
  (req, res, next) => {
    adminServicesController.updateStatus(req, res, next);
  }
);

router.delete(
  '/admins/:adminId/:serviceKey',
  requireAuth,
  requirePermission('admin_users.manage'),
  validateRequest(adminServiceKeyParamSchema),
  (req, res, next) => {
    adminServicesController.remove(req, res, next);
  }
);

export default router;
