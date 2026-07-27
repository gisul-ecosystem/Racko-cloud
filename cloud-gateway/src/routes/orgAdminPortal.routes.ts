import { Router, type Request, type Response, type NextFunction } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { authMiddleware } from '../middleware/auth.middleware';
import { verifyMiddleware } from '../middleware/verify.middleware';
import { config } from '../config';
import { ForbiddenError } from '../utils/errors';
import type { AuthenticatedRequest } from '../types';

const router = Router();

function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    const role = authReq.user?.role;
    if (!authReq.user || !role || !roles.includes(role)) {
      return next(
        new ForbiddenError(
          role
            ? `Insufficient permissions. Requires ${roles.join(' or ')}; current role is '${role}'.`
            : 'Insufficient permissions.'
        )
      );
    }
    next();
  };
}

/** JWT-protected proxy for organization admin APIs (super_admin only on cloud_automation). */
const orgAdminPortalProxy = createProxyMiddleware({
  target: config.CLOUD_AUTOMATION_URL,
  changeOrigin: true,
  timeout: 0,
  proxyTimeout: 0,
  pathRewrite: (path) => {
    const suffix = path.startsWith('/api/org-admin')
      ? path.slice('/api/org-admin'.length) || '/'
      : path;
    return `/api/org-admin${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
  },
  on: {
    error: (_err, _req, res) => {
      (res as Response).status(502).json({
        success: false,
        message: 'Organization admin service temporarily unavailable.',
        code: 'BAD_GATEWAY',
      });
    },
  },
});

router.use(
  '/api/org-admin',
  authMiddleware,
  verifyMiddleware,
  requireRole('super_admin'),
  orgAdminPortalProxy
);

export default router;
