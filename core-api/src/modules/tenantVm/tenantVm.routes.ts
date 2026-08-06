import { Router } from 'express';
import { resolveTenantContext } from '../../middleware/resolveTenantContext.middleware';
import { requireTenantAuth } from '../../middleware/requireTenantAuth.middleware';
import { requireTenantPermission } from '../../middleware/requireOrgPermission.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { tenantVmController } from './tenantVm.controller';
import {
  tenantOnboardSchema,
  tenantUserIdParamSchema,
  tenantVmConsoleSchema,
  tenantVmIdParamSchema,
  tenantVmListQuerySchema,
  tenantVmScheduleSchema,
} from './tenantVm.validation';

const router = Router();

router.use(resolveTenantContext);
router.use(requireTenantAuth);

router.get(
  '/assign/available',
  requireTenantPermission('vms.assign'),
  (req, res, next) => tenantVmController.getAvailableVms(req, res, next)
);

router.get(
  '/assign/counts',
  requireTenantPermission('vms.assign'),
  (req, res, next) => tenantVmController.getAssignedVmCounts(req, res, next)
);

router.get(
  '/assign/user/:userId',
  requireTenantPermission('vms.assign'),
  validateRequest(tenantUserIdParamSchema),
  (req, res, next) => tenantVmController.getAssignedVmsForUser(req, res, next)
);

router.post(
  '/assign/onboard',
  requireTenantPermission('vms.assign'),
  validateRequest(tenantOnboardSchema),
  (req, res, next) => tenantVmController.onboardVms(req, res, next)
);

router.delete(
  '/assign/:vmId',
  requireTenantPermission('vms.assign'),
  validateRequest(tenantVmIdParamSchema),
  (req, res, next) => tenantVmController.unassignVm(req, res, next)
);

router.patch(
  '/:vmId/schedule',
  requireTenantPermission('vms.manage'),
  validateRequest(tenantVmScheduleSchema),
  (req, res, next) => tenantVmController.updateVmSchedule(req, res, next)
);

router.get(
  '/',
  validateRequest(tenantVmListQuerySchema),
  (req, res, next) => tenantVmController.listVms(req, res, next)
);

router.get(
  '/:vmId',
  validateRequest(tenantVmIdParamSchema),
  (req, res, next) => tenantVmController.getVmDetails(req, res, next)
);

router.get(
  '/:vmId/status',
  validateRequest(tenantVmIdParamSchema),
  (req, res, next) => tenantVmController.getVmStatus(req, res, next)
);

router.get(
  '/:vmId/console',
  validateRequest(tenantVmConsoleSchema),
  (req, res, next) => tenantVmController.openConsole(req, res, next)
);

router.post(
  '/:vmId/start',
  validateRequest(tenantVmIdParamSchema),
  (req, res, next) => tenantVmController.startVm(req, res, next)
);

router.post(
  '/:vmId/stop',
  validateRequest(tenantVmIdParamSchema),
  (req, res, next) => tenantVmController.stopVm(req, res, next)
);

router.post(
  '/:vmId/restart',
  validateRequest(tenantVmIdParamSchema),
  (req, res, next) => tenantVmController.restartVm(req, res, next)
);

export default router;
