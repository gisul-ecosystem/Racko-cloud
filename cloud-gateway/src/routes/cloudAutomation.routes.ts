import { Router, type Request, type Response, type NextFunction } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { authMiddleware } from '../middleware/auth.middleware';
import { verifyMiddleware } from '../middleware/verify.middleware';
import { config } from '../config';
import { ForbiddenError } from '../utils/errors';
import type { AuthenticatedRequest } from '../types';

const router = Router();

const GATEWAY_PREFIX = '/api/v1/cloud-automation';

/** Type 2 & 3 routes — lab users and org admins; not exposed via Racko admin API. */
const BLOCKED_PATH_PATTERNS = [
  /^\/api\/v1\/cloud-automation\/(access|manage|org-admin)(\/|$)/,
  /^\/api\/v1\/cloud-automation\/usage\/(start|end)(\/|$)/,
  /^\/api\/v1\/cloud-automation\/usage\/status\//,
];

function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user || !roles.includes(authReq.user.role)) {
      return next(new ForbiddenError('Insufficient permissions.'));
    }
    next();
  };
}

function blockLabAndPortalRoutes(req: Request, _res: Response, next: NextFunction): void {
  const path = req.path.split('?')[0] ?? req.path;

  if (BLOCKED_PATH_PATTERNS.some((pattern) => pattern.test(path))) {
    return next(
      new ForbiddenError('This cloud automation endpoint is not available through the Racko admin API.')
    );
  }

  next();
}

/** AWS routes share the Azure prefix; skip them so the AWS proxy can handle the request. */
function skipAwsAutomationPaths(req: Request, _res: Response, next: NextFunction): void {
  const path = req.path.split('?')[0] ?? req.path;
  if (path.startsWith('/api/v1/cloud-automation-aws')) {
    return next('route');
  }
  next();
}

function rewriteCloudAutomationPath(path: string): string {
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

const cloudAutomationProxy = createProxyMiddleware({
  target: config.CLOUD_AUTOMATION_URL,
  changeOrigin: true,
  timeout: config.REQUEST_TIMEOUT_MS,
  pathRewrite: rewriteCloudAutomationPath,
  on: {
    error: (_err, _req, res) => {
      (res as Response).status(502).json({
        success: false,
        message: 'Cloud automation service temporarily unavailable.',
        code: 'BAD_GATEWAY',
      });
    },
  },
});

// Type 1 — Racko JWT + role guard; all admin cloud_automation APIs except lab/portal routes.
router.use(
  GATEWAY_PREFIX,
  skipAwsAutomationPaths,
  authMiddleware,
  verifyMiddleware,
  requireRole('admin', 'super_admin'),
  blockLabAndPortalRoutes,
  cloudAutomationProxy
);

export default router;
