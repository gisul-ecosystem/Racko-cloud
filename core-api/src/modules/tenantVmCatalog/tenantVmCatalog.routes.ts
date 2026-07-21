import { Router } from 'express';
import { resolveTenantContext } from '../../middleware/resolveTenantContext.middleware';
import {
  requireTenantAuth,
  requireTenantRole,
} from '../../middleware/requireTenantAuth.middleware';
import { requireActiveTenantService } from '../../middleware/requireActiveTenantService.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { tenantVmCatalogController } from './tenantVmCatalog.controller';
import {
  createCatalogVmRequestSchema,
  catalogVmRequestIdParamSchema,
} from '../vmCatalog/vmCatalog.validation';

const router = Router();

router.use(resolveTenantContext);
router.use(requireTenantAuth);
router.use(requireTenantRole('tenant_admin'));
router.use(requireActiveTenantService('create-vm'));

router.get('/plans', (req, res, next) => tenantVmCatalogController.listPlans(req, res, next));
router.get('/overview', (req, res, next) => tenantVmCatalogController.overview(req, res, next));
router.get('/vms', (req, res, next) => tenantVmCatalogController.list(req, res, next));
router.get(
  '/vms/:id',
  validateRequest(catalogVmRequestIdParamSchema),
  (req, res, next) => tenantVmCatalogController.getOne(req, res, next)
);
router.get(
  '/vms/:id/console',
  validateRequest(catalogVmRequestIdParamSchema),
  (req, res, next) => tenantVmCatalogController.openConsole(req, res, next)
);
router.post(
  '/requests',
  validateRequest(createCatalogVmRequestSchema),
  (req, res, next) => tenantVmCatalogController.createRequest(req, res, next)
);

export default router;
