import { Router } from 'express';
import { resolveTenantContext } from '../../middleware/resolveTenantContext.middleware';
import {
  requireTenantAuth,
  requireTenantRole,
} from '../../middleware/requireTenantAuth.middleware';
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
router.use(requireTenantRole('tenant_admin'));
router.use(requireActiveTenantService('dedicated-server'));

router.get('/plans', (req, res, next) => tenantDedicatedServerController.listPlans(req, res, next));
router.get('/servers', (req, res, next) => tenantDedicatedServerController.listMine(req, res, next));
router.get(
  '/servers/:id',
  validateRequest(dedicatedIdParamSchema),
  (req, res, next) => tenantDedicatedServerController.getOne(req, res, next)
);
router.get(
  '/servers/:id/console',
  validateRequest(dedicatedIdParamSchema),
  (req, res, next) => tenantDedicatedServerController.openConsole(req, res, next)
);
router.post(
  '/requests',
  validateRequest(createDedicatedRequestSchema),
  (req, res, next) => tenantDedicatedServerController.createRequest(req, res, next)
);

export default router;
