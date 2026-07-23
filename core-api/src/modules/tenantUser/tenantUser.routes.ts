import { Router } from 'express';
import { resolveTenantContext } from '../../middleware/resolveTenantContext.middleware';
import { requireTenantAuth, requireTenantRole } from '../../middleware/requireTenantAuth.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { tenantUserController } from './tenantUser.controller';
import {
  createBulkTenantUsersSchema,
  createSingleTenantUserSchema,
  bulkDeleteTenantUsersSchema,
  setTenantUserActiveSchema,
  tenantUserIdParamSchema,
} from './tenantUser.validation';

const router = Router();

router.use(resolveTenantContext);
router.use(requireTenantAuth);
router.use(requireTenantRole('tenant_admin'));

router.post(
  '/single',
  validateRequest(createSingleTenantUserSchema),
  (req, res, next) => tenantUserController.createSingle(req, res, next)
);

router.post(
  '/bulk',
  validateRequest(createBulkTenantUsersSchema),
  (req, res, next) => tenantUserController.createBulk(req, res, next)
);

router.get('/', (req, res, next) => tenantUserController.listMyUsers(req, res, next));

router.delete(
  '/bulk',
  validateRequest(bulkDeleteTenantUsersSchema),
  (req, res, next) => tenantUserController.bulkDeleteUsers(req, res, next)
);

router.patch(
  '/:userId/active',
  validateRequest(setTenantUserActiveSchema),
  (req, res, next) => tenantUserController.setUserActive(req, res, next)
);

router.delete(
  '/:userId',
  validateRequest(tenantUserIdParamSchema),
  (req, res, next) => tenantUserController.deleteUser(req, res, next)
);

export default router;
