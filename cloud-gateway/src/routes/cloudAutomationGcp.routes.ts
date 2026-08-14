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

function forwardVerifiedIdentity(req: Request, _res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;
  if (authReq.user) {
    req.headers['x-user-id'] = authReq.user.userId;
    req.headers['x-user-role'] = authReq.user.role;
  }
  next();
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

function rewriteGcpManagePortalPath(path: string): string {
  const managePrefix = `${GATEWAY_PREFIX}/manage`;
  const suffix = path.startsWith(managePrefix)
    ? path.slice(managePrefix.length) || '/'
    : path;
  return `/api/manage${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
}

function rewriteGcpOrgAdminPath(path: string): string {
  const orgAdminPrefix = `${GATEWAY_PREFIX}/org-admin`;
  const suffix = path.startsWith(orgAdminPrefix)
    ? path.slice(orgAdminPrefix.length) || '/'
    : path;
  return `/api/org-admin${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
}

const gcpManagePortalProxy = createProxyMiddleware({
  target: config.CLOUD_AUTOMATION_GCP_URL,
  changeOrigin: true,
  timeout: 0,
  proxyTimeout: 0,
  pathRewrite: rewriteGcpManagePortalPath,
  on: {
    error: (_err, _req, res) => {
      (res as Response).status(502).json({
        success: false,
        message: 'GCP manage portal service temporarily unavailable.',
        code: 'BAD_GATEWAY',
      });
    },
  },
});

const gcpOrgAdminProxy = createProxyMiddleware({
  target: config.CLOUD_AUTOMATION_GCP_URL,
  changeOrigin: true,
  timeout: 0,
  proxyTimeout: 0,
  pathRewrite: rewriteGcpOrgAdminPath,
  on: {
    error: (_err, _req, res) => {
      (res as Response).status(502).json({
        success: false,
        message: 'GCP organization admin service temporarily unavailable.',
        code: 'BAD_GATEWAY',
      });
    },
  },
});

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

/** Public GCP manage-users portal (token/JWT auth enforced by cloud_automation_gcp). */
router.use(`${GATEWAY_PREFIX}/manage`, gcpManagePortalProxy);

/** GCP organization-admin APIs are restricted to verified super admins. */
router.use(
  `${GATEWAY_PREFIX}/org-admin`,
  authMiddleware,
  verifyMiddleware,
  requireRole('super_admin'),
  forwardVerifiedIdentity,
  gcpOrgAdminProxy
);

router.use(
  GATEWAY_PREFIX,
  authMiddleware,
  verifyMiddleware,
  requireRole('admin', 'super_admin'),
  forwardVerifiedIdentity,
  cloudAutomationGcpProxy
);

export default router;
