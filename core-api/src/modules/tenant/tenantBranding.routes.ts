import { Router } from 'express';
import { resolveTenantContext } from '../../middleware/resolveTenantContext.middleware';
import { tenantBrandingController } from './tenantBranding.controller';

const router = Router();

router.use(resolveTenantContext);

router.get('/', (req, res, next) => tenantBrandingController.getMetadata(req, res, next));

router.get('/asset', (req, res, next) => tenantBrandingController.serveAsset(req, res, next));

export default router;
