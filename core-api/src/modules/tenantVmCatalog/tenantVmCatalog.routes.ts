import { Router } from 'express';
import { resolveTenantContext } from '../../middleware/resolveTenantContext.middleware';
import { requireTenantAuth } from '../../middleware/requireTenantAuth.middleware';
import { requireTenantPermission } from '../../middleware/requireOrgPermission.middleware';
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
router.use(requireActiveTenantService('create-vm'));

router.get(
  '/software-options',
  requireTenantPermission('create_vm.read'),
  (req, res, next) => tenantVmCatalogController.listSoftwareOptions(req, res, next)
);
router.get(
  '/plans',
  requireTenantPermission('create_vm.read'),
  (req, res, next) => tenantVmCatalogController.listPlans(req, res, next)
);
router.get(
  '/overview',
  requireTenantPermission('create_vm.read'),
  (req, res, next) => tenantVmCatalogController.overview(req, res, next)
);
router.get(
  '/vms',
  requireTenantPermission('create_vm.read'),
  (req, res, next) => tenantVmCatalogController.list(req, res, next)
);
router.get(
  '/vms/:id',
  requireTenantPermission('create_vm.read'),
  validateRequest(catalogVmRequestIdParamSchema),
  (req, res, next) => tenantVmCatalogController.getOne(req, res, next)
);
router.get(
  '/vms/:id/console',
  requireTenantPermission('create_vm.read'),
  validateRequest(catalogVmRequestIdParamSchema),
  (req, res, next) => tenantVmCatalogController.openConsole(req, res, next)
);
router.post(
  '/requests',
  requireTenantPermission('create_vm.request'),
  validateRequest(createCatalogVmRequestSchema),
  (req, res, next) => tenantVmCatalogController.createRequest(req, res, next)
);

export default router;
