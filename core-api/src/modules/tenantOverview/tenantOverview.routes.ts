import { Router } from 'express';
import { resolveTenantContext } from '../../middleware/resolveTenantContext.middleware';
import { requireTenantAuth } from '../../middleware/requireTenantAuth.middleware';
import { requireTenantPermission } from '../../middleware/requireOrgPermission.middleware';
import { tenantOverviewController } from './tenantOverview.controller';

const router = Router();

router.use(resolveTenantContext);
router.use(requireTenantAuth);

router.get('/', requireTenantPermission('overview.read'), (req, res, next) => {
  tenantOverviewController.getOverview(req, res, next);
});

export default router;
