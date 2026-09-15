import { Router } from 'express';
import { resolveTenantContext } from '../../middleware/resolveTenantContext.middleware';
import { validateRequest } from '../../middleware/validate.middleware';
import { apiCredentialsController } from './apiCredentials.controller';
import { requireApiCredentialActor } from './requireApiCredentialActor.middleware';
import {
  apiCredentialIdParamSchema,
  createApiCredentialSchema,
  revokeApiCredentialSchema,
} from './apiCredentials.validation';

const router = Router();

router.use(resolveTenantContext);
router.use(requireApiCredentialActor);

router.post(
  '/',
  validateRequest(createApiCredentialSchema),
  (req, res, next) => apiCredentialsController.create(req, res, next)
);

router.get('/', (req, res, next) => apiCredentialsController.list(req, res, next));

router.get(
  '/:id/usage',
  validateRequest(apiCredentialIdParamSchema),
  (req, res, next) => apiCredentialsController.usage(req, res, next)
);

router.post(
  '/:id/revoke',
  validateRequest(revokeApiCredentialSchema),
  (req, res, next) => apiCredentialsController.revoke(req, res, next)
);

export default router;
