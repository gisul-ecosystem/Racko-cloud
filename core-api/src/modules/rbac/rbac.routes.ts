import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import {
  requireControlPlane,
  requirePermission,
} from '../../middleware/requirePermission.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { rbacController } from './rbac.controller';
import {
  createRbacRoleSchema,
  updateRbacRoleSchema,
  setUserRolesSchema,
  createStaffUserSchema,
  deleteStaffUserSchema,
} from './rbac.validation';

const router = Router();

/** Any of these unlocks the Access Control console (super_admin bypasses). */
const requireAccessControl = requirePermission('rbac.assign', 'rbac.roles.write');
const requireRolesWrite = requirePermission('rbac.roles.write');
const requireAssign = requirePermission('rbac.assign');

router.use(requireAuth);

/** Control-plane users (super_admin | staff): effective permissions for UI gating */
router.get('/me', requireControlPlane(), (req, res, next) => {
  rbacController.getMyPermissions(req, res, next);
});

router.get('/permissions', requireAccessControl, (req, res, next) => {
  rbacController.getCatalog(req, res, next);
});

router.get('/roles', requireAccessControl, (req, res, next) => {
  rbacController.listRoles(req, res, next);
});

router.post(
  '/roles',
  requireRolesWrite,
  validateRequest(createRbacRoleSchema),
  (req, res, next) => {
    rbacController.createRole(req, res, next);
  }
);

router.patch(
  '/roles/:id',
  requireRolesWrite,
  validateRequest(updateRbacRoleSchema),
  (req, res, next) => {
    rbacController.updateRole(req, res, next);
  }
);

router.get('/people', requireAccessControl, (req, res, next) => {
  rbacController.listPeople(req, res, next);
});

router.put(
  '/people/:userId/roles',
  requireAssign,
  validateRequest(setUserRolesSchema),
  (req, res, next) => {
    rbacController.setUserRoles(req, res, next);
  }
);

router.post(
  '/people/staff',
  requireAssign,
  validateRequest(createStaffUserSchema),
  (req, res, next) => {
    rbacController.createStaff(req, res, next);
  }
);

router.delete(
  '/people/:userId',
  requireAssign,
  validateRequest(deleteStaffUserSchema),
  (req, res, next) => {
    rbacController.deleteStaff(req, res, next);
  }
);

router.get('/audit', requireAccessControl, (req, res, next) => {
  rbacController.listAudit(req, res, next);
});

export default router;
