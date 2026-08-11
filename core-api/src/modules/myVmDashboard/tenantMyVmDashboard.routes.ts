import { Router } from 'express';
import { resolveTenantContext } from '../../middleware/resolveTenantContext.middleware';
import { requireTenantAuth } from '../../middleware/requireTenantAuth.middleware';
import { requireTenantPermission } from '../../middleware/requireOrgPermission.middleware';
import { myVmDashboardController } from './myVmDashboard.controller';

const router = Router();

router.use(resolveTenantContext);
router.use(requireTenantAuth);

/** GET /api/v1/tenant-my-vms — read-only VM list gated by my_vms.read. */
router.get(
  '/',
  requireTenantPermission('my_vms.read'),
  (req, res, next) => myVmDashboardController.listForTenant(req, res, next)
);

export default router;
