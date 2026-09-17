import { Router } from 'express';
import { requireApiAccessToken } from './requireApiAccessToken.middleware';
import { publicApiErrorHandler } from './publicApi.errorHandler';
import { publicApiRateLimitMiddleware } from './publicApiRateLimit.middleware';
import { publicApiUsageMiddleware } from './publicApiUsage.middleware';
import publicRouter from './public.routes';

const router = Router();

router.use(requireApiAccessToken);
router.use(publicApiUsageMiddleware);
router.use(publicApiRateLimitMiddleware);
router.use(publicRouter);
router.use(publicApiErrorHandler);

export default router;
