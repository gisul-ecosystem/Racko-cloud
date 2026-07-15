import { Router } from 'express';
import { resolveTenantContext } from '../../middleware/resolveTenantContext.middleware';
import { requireTenantAuth, requireTenantRole } from '../../middleware/requireTenantAuth.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import {
  createExternalVMSchema,
  bulkCreateExternalVMSchema,
  externalVMIdParamSchema,
} from '../external-vm/external-vm.validation';
import { tenantExternalVmController } from './tenantExternalVm.controller';

const router = Router();

router.use(resolveTenantContext);
router.use(requireTenantAuth);

router.post(
  '/bulk',
  requireTenantRole('tenant_admin'),
  validateRequest(bulkCreateExternalVMSchema),
  (req, res, next) => tenantExternalVmController.bulkCreate(req, res, next)
);

router.post(
  '/',
  requireTenantRole('tenant_admin'),
  validateRequest(createExternalVMSchema),
  (req, res, next) => tenantExternalVmController.create(req, res, next)
);

router.get('/', (req, res, next) => tenantExternalVmController.list(req, res, next));

router.get(
  '/:id/console',
  validateRequest(externalVMIdParamSchema),
  (req, res, next) => tenantExternalVmController.openConsole(req, res, next)
);

router.get(
  '/:id',
  validateRequest(externalVMIdParamSchema),
  (req, res, next) => tenantExternalVmController.getOne(req, res, next)
);

router.delete(
  '/:id',
  requireTenantRole('tenant_admin'),
  validateRequest(externalVMIdParamSchema),
  (req, res, next) => tenantExternalVmController.remove(req, res, next)
);

export default router;
