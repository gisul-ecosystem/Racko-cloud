import { Router } from 'express';
import { requireInternalSecret } from '../../middleware/internalSecret.middleware';
import { internalTenantController } from './internalTenant.controller';

const router = Router();

router.post('/resolve', requireInternalSecret, (req, res, next) => {
  internalTenantController.resolveByHost(req, res, next);
});

router.get('/:id', requireInternalSecret, (req, res, next) => {
  internalTenantController.getById(req, res, next);
});

export default router;
