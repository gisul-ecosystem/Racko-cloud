import { Router } from 'express';
import { superAdminController } from './superAdmin.controller';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import {
  setTenantAdminActiveSchema,
  superAdminTenantIdParamSchema,
} from './superAdmin.validation';

const router = Router();

router.use(requireAuth);
router.use(requireRole('super_admin'));

router.get('/overview', (req, res, next) => {
  superAdminController.overview(req, res, next);
});

router.get(
  '/tenants/:tenantId/admins',
  validateRequest(superAdminTenantIdParamSchema),
  (req, res, next) => {
    superAdminController.listTenantAdmins(req, res, next);
  }
);

router.patch(
  '/tenants/:tenantId/admins/:tenantUserId/active',
  validateRequest(setTenantAdminActiveSchema),
  (req, res, next) => {
    superAdminController.setTenantAdminActive(req, res, next);
  }
);

export default router;
