import { Router } from 'express';
import { resolveTenantContext } from '../../middleware/resolveTenantContext.middleware';
import { requireTenantAuth, requireTenantRole } from '../../middleware/requireTenantAuth.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import {
  createExternalVMSchema,
  bulkCreateExternalVMSchema,
  bulkDeleteExternalVMSchema,
  externalVMIdParamSchema,
  userIdParamSchema,
  assignExternalVMsSchema,
  bulkAssignExternalPairsSchema,
  updateExternalVmScheduleSchema,
} from '../external-vm/external-vm.validation';
import { tenantExternalVmController } from './tenantExternalVm.controller';

const router = Router();

router.use(resolveTenantContext);
router.use(requireTenantAuth);

router.get(
  '/assign/available',
  requireTenantRole('tenant_admin'),
  (req, res, next) => tenantExternalVmController.getAvailable(req, res, next)
);

router.get(
  '/assign/counts',
  requireTenantRole('tenant_admin'),
  (req, res, next) => tenantExternalVmController.getAssignedCounts(req, res, next)
);

router.get(
  '/assign/user/:userId',
  requireTenantRole('tenant_admin'),
  validateRequest(userIdParamSchema),
  (req, res, next) => tenantExternalVmController.getAssignedForUser(req, res, next)
);

router.post(
  '/assign',
  requireTenantRole('tenant_admin'),
  validateRequest(assignExternalVMsSchema),
  (req, res, next) => tenantExternalVmController.assign(req, res, next)
);

router.post(
  '/assign/bulk',
  requireTenantRole('tenant_admin'),
  validateRequest(bulkAssignExternalPairsSchema),
  (req, res, next) => tenantExternalVmController.bulkAssignOneToOne(req, res, next)
);

router.get(
  '/assign/jobs/:jobId',
  requireTenantRole('tenant_admin'),
  (req, res, next) => tenantExternalVmController.getBulkAssignJobStatus(req, res, next)
);

router.delete(
  '/assign/:id',
  requireTenantRole('tenant_admin'),
  validateRequest(externalVMIdParamSchema),
  (req, res, next) => tenantExternalVmController.unassign(req, res, next)
);

router.patch(
  '/:id/schedule',
  requireTenantRole('tenant_admin'),
  validateRequest(updateExternalVmScheduleSchema),
  (req, res, next) => tenantExternalVmController.updateSchedule(req, res, next)
);

router.post(
  '/bulk',
  requireTenantRole('tenant_admin'),
  validateRequest(bulkCreateExternalVMSchema),
  (req, res, next) => tenantExternalVmController.bulkCreate(req, res, next)
);

router.delete(
  '/bulk',
  requireTenantRole('tenant_admin'),
  validateRequest(bulkDeleteExternalVMSchema),
  (req, res, next) => tenantExternalVmController.bulkRemove(req, res, next)
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
