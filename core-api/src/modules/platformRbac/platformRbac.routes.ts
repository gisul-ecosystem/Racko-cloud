import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { platformRbacController } from './platformRbac.controller';
import {
  createPlatformRoleSchema,
  updatePlatformRoleSchema,
  setPlatformUserRolesSchema,
  invitePlatformOperatorSchema,
} from './platformRbac.validation';

const router = Router();

router.use(requireAuth);
router.use(requireRole('admin'));

router.get('/me', (req, res, next) => {
  platformRbacController.getMyPermissions(req, res, next);
});

router.get('/permissions', (req, res, next) => {
  platformRbacController.getCatalog(req, res, next);
});

router.get('/roles', (req, res, next) => {
  platformRbacController.listRoles(req, res, next);
});

router.post('/roles', validateRequest(createPlatformRoleSchema), (req, res, next) => {
  platformRbacController.createRole(req, res, next);
});

router.patch('/roles/:id', validateRequest(updatePlatformRoleSchema), (req, res, next) => {
  platformRbacController.updateRole(req, res, next);
});

router.get('/people', (req, res, next) => {
  platformRbacController.listPeople(req, res, next);
});

router.put(
  '/people/:userId/roles',
  validateRequest(setPlatformUserRolesSchema),
  (req, res, next) => {
    platformRbacController.setUserRoles(req, res, next);
  }
);

router.post(
  '/people/operators',
  validateRequest(invitePlatformOperatorSchema),
  (req, res, next) => {
    platformRbacController.inviteOperator(req, res, next);
  }
);

export default router;
