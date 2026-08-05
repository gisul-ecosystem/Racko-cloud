import { Router } from 'express';
import { resolveTenantContext } from '../../middleware/resolveTenantContext.middleware';
import { requireTenantAuth } from '../../middleware/requireTenantAuth.middleware';
import { requireTenantPermission } from '../../middleware/requireOrgPermission.middleware';
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
  updateExternalVmOverrideSchema,
  bulkUpdateExternalVmOverrideSchema,
} from '../external-vm/external-vm.validation';
import { tenantExternalVmController } from './tenantExternalVm.controller';

const router = Router();

router.use(resolveTenantContext);
router.use(requireTenantAuth);

router.get(
  '/assign/available',
  requireTenantPermission('elastic.manage'),
  (req, res, next) => tenantExternalVmController.getAvailable(req, res, next)
);

router.get(
  '/assign/counts',
  requireTenantPermission('elastic.manage'),
  (req, res, next) => tenantExternalVmController.getAssignedCounts(req, res, next)
);

router.get(
  '/assign/user/:userId',
  requireTenantPermission('elastic.manage'),
  validateRequest(userIdParamSchema),
  (req, res, next) => tenantExternalVmController.getAssignedForUser(req, res, next)
);

router.post(
  '/assign',
  requireTenantPermission('elastic.manage'),
  validateRequest(assignExternalVMsSchema),
  (req, res, next) => tenantExternalVmController.assign(req, res, next)
);

router.post(
  '/assign/bulk',
  requireTenantPermission('elastic.manage'),
  validateRequest(bulkAssignExternalPairsSchema),
  (req, res, next) => tenantExternalVmController.bulkAssignOneToOne(req, res, next)
);

router.get(
  '/assign/jobs/:jobId',
  requireTenantPermission('elastic.manage'),
  (req, res, next) => tenantExternalVmController.getBulkAssignJobStatus(req, res, next)
);

router.delete(
  '/assign/:id',
  requireTenantPermission('elastic.manage'),
  validateRequest(externalVMIdParamSchema),
  (req, res, next) => tenantExternalVmController.unassign(req, res, next)
);

router.patch(
  '/:id/schedule',
  requireTenantPermission('elastic.manage'),
  validateRequest(updateExternalVmScheduleSchema),
  (req, res, next) => tenantExternalVmController.updateSchedule(req, res, next)
);

router.patch(
  '/override/bulk',
  requireTenantPermission('elastic.manage'),
  validateRequest(bulkUpdateExternalVmOverrideSchema),
  (req, res, next) => tenantExternalVmController.bulkUpdateOverride(req, res, next)
);

router.patch(
  '/:id/override',
  requireTenantPermission('elastic.manage'),
  validateRequest(updateExternalVmOverrideSchema),
  (req, res, next) => tenantExternalVmController.updateOverride(req, res, next)
);

router.post(
  '/bulk',
  requireTenantPermission('elastic.manage'),
  validateRequest(bulkCreateExternalVMSchema),
  (req, res, next) => tenantExternalVmController.bulkCreate(req, res, next)
);

router.delete(
  '/bulk',
  requireTenantPermission('elastic.manage'),
  validateRequest(bulkDeleteExternalVMSchema),
  (req, res, next) => tenantExternalVmController.bulkRemove(req, res, next)
);

router.post(
  '/',
  requireTenantPermission('elastic.manage'),
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
  requireTenantPermission('elastic.manage'),
  validateRequest(externalVMIdParamSchema),
  (req, res, next) => tenantExternalVmController.remove(req, res, next)
);

export default router;
