import { Router, type Request, type Response, type NextFunction } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { authMiddleware } from '../middleware/auth.middleware';
import { verifyMiddleware } from '../middleware/verify.middleware';
import { config } from '../config';
import { ForbiddenError } from '../utils/errors';
import type { AuthenticatedRequest } from '../types';

const router = Router();

const GATEWAY_PREFIX = '/api/v1/cloud-automation-gcp';

function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user || !roles.includes(authReq.user.role)) {
      return next(new ForbiddenError('Insufficient permissions.'));
    }
    next();
  };
}

function rewriteCloudAutomationGcpPath(path: string): string {
  if (path === '/health' || path === `${GATEWAY_PREFIX}/health`) {
    return '/health';
  }

  if (path.startsWith('/health/')) {
    return path;
  }

  if (path.startsWith(`${GATEWAY_PREFIX}/health/`)) {
    return `/health/${path.slice(`${GATEWAY_PREFIX}/health/`.length)}`;
  }

  let suffix = path;
  if (path.startsWith(GATEWAY_PREFIX)) {
    suffix = path.slice(GATEWAY_PREFIX.length);
  }

  if (!suffix || suffix === '/') {
    return '/api';
  }

  return `/api${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
}

const cloudAutomationGcpProxy = createProxyMiddleware({
  target: config.CLOUD_AUTOMATION_GCP_URL,
  changeOrigin: true,
  timeout: config.REQUEST_TIMEOUT_MS,
  pathRewrite: rewriteCloudAutomationGcpPath,
  on: {
    error: (_err, _req, res) => {
      (res as Response).status(502).json({
        success: false,
        message: 'Cloud automation GCP service temporarily unavailable.',
        code: 'BAD_GATEWAY',
      });
    },
  },
});

router.use(
  GATEWAY_PREFIX,
  authMiddleware,
  verifyMiddleware,
  requireRole('admin', 'super_admin'),
  cloudAutomationGcpProxy
);

export default router;
