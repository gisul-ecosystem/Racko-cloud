import { Router } from 'express';
import { resolveTenantContext } from '../../middleware/resolveTenantContext.middleware';
import { requireTenantAuth } from '../../middleware/requireTenantAuth.middleware';
import { requireTenantPermission } from '../../middleware/requireOrgPermission.middleware';
import { requireActiveTenantService } from '../../middleware/requireActiveTenantService.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { tenantDedicatedServerController } from './tenantDedicatedServer.controller';
import {
  createDedicatedRequestSchema,
  dedicatedIdParamSchema,
} from '../dedicatedServer/dedicatedServer.validation';

const router = Router();

router.use(resolveTenantContext);
router.use(requireTenantAuth);
router.use(requireActiveTenantService('dedicated-server'));

router.get(
  '/plans',
  requireTenantPermission('dedicated.read'),
  (req, res, next) => tenantDedicatedServerController.listPlans(req, res, next)
);
router.get(
  '/servers',
  requireTenantPermission('dedicated.read'),
  (req, res, next) => tenantDedicatedServerController.listMine(req, res, next)
);
router.get(
  '/servers/:id',
  requireTenantPermission('dedicated.read'),
  validateRequest(dedicatedIdParamSchema),
  (req, res, next) => tenantDedicatedServerController.getOne(req, res, next)
);
router.get(
  '/servers/:id/console',
  requireTenantPermission('dedicated.read'),
  validateRequest(dedicatedIdParamSchema),
  (req, res, next) => tenantDedicatedServerController.openConsole(req, res, next)
);
router.post(
  '/requests',
  requireTenantPermission('dedicated.request'),
  validateRequest(createDedicatedRequestSchema),
  (req, res, next) => tenantDedicatedServerController.createRequest(req, res, next)
);

export default router;
