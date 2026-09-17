import { Router } from 'express';
import { requireScope } from './requireScope.middleware';
import { publicValidateRequest } from './publicValidate.middleware';
import { publicVmsController } from './publicVms.controller';
import {
  publicCreateVmSchema,
  publicJobIdParamSchema,
  publicListVmsQuerySchema,
  publicPlatformAssignSchema,
  publicTenantAssignSchema,
  publicVmConsoleQuerySchema,
  publicVmIdParamSchema,
} from './publicVms.validation';
import type { ApiAccessAuthenticatedRequest } from './requireApiAccessToken.middleware';

const router = Router();

router.get(
  '/templates',
  requireScope('vms:read'),
  (req, res, next) => publicVmsController.listTemplates(req, res, next)
);

router.get(
  '/jobs/:id',
  requireScope('vms:read'),
  publicValidateRequest(publicJobIdParamSchema),
  (req, res, next) => publicVmsController.getJob(req, res, next)
);

router.post(
  '/vms/assign',
  requireScope('vms:assign'),
  (req, res, next) => {
    const apiReq = req as ApiAccessAuthenticatedRequest;
    const schema =
      apiReq.apiAccess?.ownerType === 'tenant'
        ? publicTenantAssignSchema
        : publicPlatformAssignSchema;
    publicValidateRequest(schema)(req, res, () => publicVmsController.assign(req, res, next));
  }
);

router.get(
  '/vms',
  requireScope('vms:read'),
  publicValidateRequest(publicListVmsQuerySchema),
  (req, res, next) => publicVmsController.listVms(req, res, next)
);

router.post(
  '/vms',
  requireScope('vms:write'),
  publicValidateRequest(publicCreateVmSchema),
  (req, res, next) => publicVmsController.createVms(req, res, next)
);

router.get(
  '/vms/:id',
  requireScope('vms:read'),
  publicValidateRequest(publicVmIdParamSchema),
  (req, res, next) => publicVmsController.getVm(req, res, next)
);

router.delete(
  '/vms/:id',
  requireScope('vms:write'),
  publicValidateRequest(publicVmIdParamSchema),
  (req, res, next) => publicVmsController.deleteVm(req, res, next)
);

router.post(
  '/vms/:id/start',
  requireScope('vms:write'),
  publicValidateRequest(publicVmIdParamSchema),
  (req, res, next) => publicVmsController.startVm(req, res, next)
);

router.post(
  '/vms/:id/stop',
  requireScope('vms:write'),
  publicValidateRequest(publicVmIdParamSchema),
  (req, res, next) => publicVmsController.stopVm(req, res, next)
);

router.post(
  '/vms/:id/restart',
  requireScope('vms:write'),
  publicValidateRequest(publicVmIdParamSchema),
  (req, res, next) => publicVmsController.restartVm(req, res, next)
);

router.get(
  '/vms/:id/status',
  requireScope('vms:read'),
  publicValidateRequest(publicVmIdParamSchema),
  (req, res, next) => publicVmsController.getVmStatus(req, res, next)
);

router.get(
  '/vms/:id/console',
  requireScope('vms:console'),
  publicValidateRequest(publicVmConsoleQuerySchema),
  (req, res, next) => publicVmsController.getConsole(req, res, next)
);

export default router;
