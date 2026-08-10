import { Router } from 'express';
import { resolveTenantContext } from '../../middleware/resolveTenantContext.middleware';
import { requireTenantAuth } from '../../middleware/requireTenantAuth.middleware';
import { tenantPortalServicesController } from './tenantPortalServices.controller';

const router = Router();

router.use(resolveTenantContext);
router.use(requireTenantAuth);

router.get('/', (req, res, next) => {
  tenantPortalServicesController.listMyServices(req, res, next);
});

router.get('/catalog', (req, res, next) => {
  tenantPortalServicesController.listCatalog(req, res, next);
});

export default router;
