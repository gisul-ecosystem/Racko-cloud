import { Router } from 'express';
import { tenantController } from './tenant.controller';
import { tenantServiceConfigController } from './tenantServiceConfig.controller';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import {
  createTenantSchema,
  createTenantAdminSchema,
  listTenantsSchema,
  tenantIdParamSchema,
  updateTenantSchema,
} from './tenant.validation';
import {
  assignServiceRequestSchema,
  listTenantServicesRequestSchema,
  removeServiceConfigRequestSchema,
  updateServiceConfigRequestSchema,
} from './tenantServiceConfig.validation';

const router = Router();

router.use(requireAuth);
router.use(requireRole('super_admin'));

router.post('/', validateRequest(createTenantSchema), (req, res, next) => {
  tenantController.create(req, res, next);
});

router.get('/', validateRequest(listTenantsSchema), (req, res, next) => {
  tenantController.list(req, res, next);
});

router.post(
  '/:tenantId/services',
  validateRequest(assignServiceRequestSchema),
  (req, res, next) => {
    tenantServiceConfigController.assignService(req, res, next);
  }
);

router.get(
  '/:tenantId/services',
  validateRequest(listTenantServicesRequestSchema),
  (req, res, next) => {
    tenantServiceConfigController.listServices(req, res, next);
  }
);

router.patch(
  '/:tenantId/services/:serviceKey',
  validateRequest(updateServiceConfigRequestSchema),
  (req, res, next) => {
    tenantServiceConfigController.updateServiceConfig(req, res, next);
  }
);

router.delete(
  '/:tenantId/services/:serviceKey',
  validateRequest(removeServiceConfigRequestSchema),
  (req, res, next) => {
    tenantServiceConfigController.removeService(req, res, next);
  }
);

router.get('/:id', validateRequest(tenantIdParamSchema), (req, res, next) => {
  tenantController.getById(req, res, next);
});

router.patch('/:id', validateRequest(updateTenantSchema), (req, res, next) => {
  tenantController.update(req, res, next);
});

router.post(
  '/:tenantId/admin',
  validateRequest(createTenantAdminSchema),
  (req, res, next) => {
    tenantController.createAdmin(req, res, next);
  }
);

export default router;
