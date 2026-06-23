import { Router } from 'express';
import { tenantController } from './tenant.controller';
import { requireAuth } from '../../middleware/requireAuth.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import {
  createTenantSchema,
  createTenantAdminSchema,
  listTenantsSchema,
  tenantIdParamSchema,
  tenantLimitsUpdateRequestSchema,
  tenantServiceMutationRequestSchema,
  updateTenantSchema,
} from './tenant.validation';

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
  '/:tenantId/services/add',
  validateRequest(tenantServiceMutationRequestSchema),
  (req, res, next) => {
    tenantController.addServices(req, res, next);
  }
);

router.post(
  '/:tenantId/services/remove',
  validateRequest(tenantServiceMutationRequestSchema),
  (req, res, next) => {
    tenantController.removeServices(req, res, next);
  }
);

router.put(
  '/:tenantId/services',
  validateRequest(tenantServiceMutationRequestSchema),
  (req, res, next) => {
    tenantController.setServices(req, res, next);
  }
);

router.patch(
  '/:tenantId/limits',
  validateRequest(tenantLimitsUpdateRequestSchema),
  (req, res, next) => {
    tenantController.updateLimits(req, res, next);
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
