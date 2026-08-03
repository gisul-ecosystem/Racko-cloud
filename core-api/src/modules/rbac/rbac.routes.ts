import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { requireControlPlane } from '../../middleware/requirePermission.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { rbacController } from './rbac.controller';
import {
  createRbacRoleSchema,
  updateRbacRoleSchema,
  setUserRolesSchema,
  createStaffUserSchema,
} from './rbac.validation';

const router = Router();

router.use(requireAuth);

/** Control-plane users (super_admin | staff): effective permissions for UI gating */
router.get('/me', requireControlPlane(), (req, res, next) => {
  rbacController.getMyPermissions(req, res, next);
});

/**
 * Access Control management — super_admin only in v1.
 * Staff receive permissions; they do not manage the matrix yet.
 */
router.get('/permissions', requireRole('super_admin'), (req, res, next) => {
  rbacController.getCatalog(req, res, next);
});

router.get('/roles', requireRole('super_admin'), (req, res, next) => {
  rbacController.listRoles(req, res, next);
});

router.post(
  '/roles',
  requireRole('super_admin'),
  validateRequest(createRbacRoleSchema),
  (req, res, next) => {
    rbacController.createRole(req, res, next);
  }
);

router.patch(
  '/roles/:id',
  requireRole('super_admin'),
  validateRequest(updateRbacRoleSchema),
  (req, res, next) => {
    rbacController.updateRole(req, res, next);
  }
);

router.get('/people', requireRole('super_admin'), (req, res, next) => {
  rbacController.listPeople(req, res, next);
});

router.put(
  '/people/:userId/roles',
  requireRole('super_admin'),
  validateRequest(setUserRolesSchema),
  (req, res, next) => {
    rbacController.setUserRoles(req, res, next);
  }
);

router.post(
  '/people/staff',
  requireRole('super_admin'),
  validateRequest(createStaffUserSchema),
  (req, res, next) => {
    rbacController.createStaff(req, res, next);
  }
);

router.get('/audit', requireRole('super_admin'), (req, res, next) => {
  rbacController.listAudit(req, res, next);
});

export default router;
