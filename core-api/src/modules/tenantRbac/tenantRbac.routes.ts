import { Router } from 'express';
import { resolveTenantContext } from '../../middleware/resolveTenantContext.middleware';
import { requireTenantAuth } from '../../middleware/requireTenantAuth.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { tenantRbacController } from './tenantRbac.controller';
import {
  createTenantRoleSchema,
  updateTenantRoleSchema,
  setTenantUserRolesSchema,
  inviteTenantOperatorSchema,
} from './tenantRbac.validation';

const router = Router();

router.use(resolveTenantContext);
router.use(requireTenantAuth);

router.get('/me', (req, res, next) => {
  tenantRbacController.getMyPermissions(req, res, next);
});

router.get('/permissions', (req, res, next) => {
  tenantRbacController.getCatalog(req, res, next);
});

router.get('/roles', (req, res, next) => {
  tenantRbacController.listRoles(req, res, next);
});

router.post('/roles', validateRequest(createTenantRoleSchema), (req, res, next) => {
  tenantRbacController.createRole(req, res, next);
});

router.patch('/roles/:id', validateRequest(updateTenantRoleSchema), (req, res, next) => {
  tenantRbacController.updateRole(req, res, next);
});

router.get('/people', (req, res, next) => {
  tenantRbacController.listPeople(req, res, next);
});

router.put(
  '/people/:userId/roles',
  validateRequest(setTenantUserRolesSchema),
  (req, res, next) => {
    tenantRbacController.setUserRoles(req, res, next);
  }
);

router.post(
  '/people/operators',
  validateRequest(inviteTenantOperatorSchema),
  (req, res, next) => {
    tenantRbacController.inviteOperator(req, res, next);
  }
);

router.delete('/people/:userId', (req, res, next) => {
  tenantRbacController.deleteOperator(req, res, next);
});

export default router;
