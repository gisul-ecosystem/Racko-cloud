import { Router, type Request, type Response, type NextFunction } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { authMiddleware } from '../middleware/auth.middleware';
import { verifyMiddleware } from '../middleware/verify.middleware';
import {
  loginFailedRateLimiter,
  registerRateLimiter,
  verifyEmailRateLimiter,
} from '../middleware/rateLimit.middleware';
import { loginSlowDown } from '../middleware/slowDown.middleware';
import { config } from '../config';
import { ForbiddenError } from '../utils/errors';
import type { AuthenticatedRequest } from '../types';

const router = Router();

// Single proxy instance — full path is preserved because all routes are
// mounted with their complete path (no prefix stripping by Express) 
const coreApiProxy = createProxyMiddleware({
  target: config.CORE_API_URL,
  changeOrigin: true,
  timeout: config.REQUEST_TIMEOUT_MS,
  // Strip Domain from Set-Cookie so the browser accepts cookies from localhost:8000
  cookieDomainRewrite: { '*': '' },
  // Ensure cookie path is always /
  cookiePathRewrite: { '*': '/' },
  on: {
    proxyRes: (proxyRes) => {
      const setCookie = proxyRes.headers['set-cookie'];
      if (setCookie) {
        proxyRes.headers['set-cookie'] = setCookie.map((cookie) =>
          cookie
            // Remove Domain attribute entirely
            .replace(/;\s*Domain=[^;]*/gi, '')
            // Normalise Path to /
            .replace(/;\s*Path=[^;]*/gi, '; Path=/')
        );
      }
    },
    error: (_err, _req, res) => {
      (res as Response).status(502).json({
        success: false,
        message: 'Service temporarily unavailable.',
        code: 'BAD_GATEWAY',
      });
    },
  },
});

// Role guard middleware factory
function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user || !roles.includes(authReq.user.role)) {
      return next(new ForbiddenError('Insufficient permissions.'));
    }
    next();
  };
}

// ─── PUBLIC ROUTES (no auth required) ────────────────────────────────────────
router.post('/api/v1/auth/register', registerRateLimiter, coreApiProxy);
router.post('/api/v1/auth/login', loginFailedRateLimiter, loginSlowDown, coreApiProxy);
router.post('/api/v1/auth/verify-email', verifyEmailRateLimiter, coreApiProxy);
router.post('/api/v1/auth/refresh', coreApiProxy);
router.post('/api/v1/auth/logout', coreApiProxy);

// ─── PROTECTED AUTH ROUTES ────────────────────────────────────────────────────
router.get('/api/v1/auth/me', authMiddleware, verifyMiddleware, coreApiProxy);

// ─── INTERNAL ROUTE (gateway → core-api only) ────────────────────────────────
// Note: validate is called internally by verifyMiddleware, not by clients
router.post('/api/v1/auth/validate', coreApiProxy);

// ─── USER ROUTES (super_admin only) ──────────────────────────────────────────
router.get('/api/v1/users', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.get('/api/v1/users/:id', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.patch('/api/v1/users/:id/active', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);

// ─── PROXMOX ROUTES (super_admin only) ───────────────────────────────────────
router.get('/api/v1/proxmox/overview', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.get('/api/v1/proxmox/cluster', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.get('/api/v1/proxmox/nodes', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.get('/api/v1/proxmox/nodes/:nodeName', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.get('/api/v1/proxmox/storage', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.get('/api/v1/proxmox/vms', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);

// ─── VM ROUTES (admin + super_admin) ─────────────────────────────────────────
router.get('/api/v1/vms/templates', authMiddleware, verifyMiddleware, coreApiProxy);
router.get('/api/v1/vms/templates/catalog', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.put('/api/v1/vms/templates/selection', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.get('/api/v1/vms/templates/:templateId', authMiddleware, verifyMiddleware, coreApiProxy);
router.get('/api/v1/vms/admin/all', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.get('/api/v1/vms/jobs', authMiddleware, verifyMiddleware, coreApiProxy);
router.get('/api/v1/vms/jobs/:jobId', authMiddleware, verifyMiddleware, coreApiProxy);
// Assignment routes — must be before /:vmId
router.get('/api/v1/vms/assign/available', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.get('/api/v1/vms/assign/counts', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.get('/api/v1/vms/assign/user/:userId', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.post('/api/v1/vms/assign', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.post('/api/v1/vms/assign/bulk', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.delete('/api/v1/vms/assign/:vmId', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.get('/api/v1/vms/my-assigned', authMiddleware, verifyMiddleware, requireRole('user'), coreApiProxy);
router.post('/api/v1/vms/bulk-delete', authMiddleware, verifyMiddleware, coreApiProxy);
router.post('/api/v1/vms', authMiddleware, verifyMiddleware, coreApiProxy);
router.get('/api/v1/vms', authMiddleware, verifyMiddleware, coreApiProxy);
router.get('/api/v1/vms/:vmId', authMiddleware, verifyMiddleware, coreApiProxy);
router.get('/api/v1/vms/:vmId/status', authMiddleware, verifyMiddleware, coreApiProxy);
router.get('/api/v1/vms/:vmId/events', authMiddleware, verifyMiddleware, coreApiProxy);
router.get('/api/v1/vms/:vmId/console', authMiddleware, verifyMiddleware, coreApiProxy);
router.delete('/api/v1/vms/:vmId', authMiddleware, verifyMiddleware, coreApiProxy);
router.post('/api/v1/vms/:vmId/start', authMiddleware, verifyMiddleware, coreApiProxy);
router.post('/api/v1/vms/:vmId/stop', authMiddleware, verifyMiddleware, coreApiProxy);
router.post('/api/v1/vms/:vmId/hibernate', authMiddleware, verifyMiddleware, coreApiProxy);
router.post('/api/v1/vms/:vmId/force-stop', authMiddleware, verifyMiddleware, coreApiProxy);
router.post('/api/v1/vms/:vmId/restart', authMiddleware, verifyMiddleware, coreApiProxy);
router.post('/api/v1/vms/:vmId/reset', authMiddleware, verifyMiddleware, coreApiProxy);
// Virtualization (Hyper-V) — previously missing, caused 404
router.get('/api/v1/vms/:vmId/virtualization', authMiddleware, verifyMiddleware, coreApiProxy);
router.post('/api/v1/vms/:vmId/virtualization/enable', authMiddleware, verifyMiddleware, coreApiProxy);
router.post('/api/v1/vms/:vmId/virtualization/disable', authMiddleware, verifyMiddleware, coreApiProxy);
router.post('/api/v1/vms/:vmId/virtualization/cancel', authMiddleware, verifyMiddleware, coreApiProxy);
router.post('/api/v1/vms/:vmId/software/cancel', authMiddleware, verifyMiddleware, coreApiProxy);

// ─── SOFTWARE ROUTES ──────────────────────────────────────────────────────────
router.get('/api/v1/software', authMiddleware, verifyMiddleware, coreApiProxy);
router.get('/api/v1/software/all', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.post('/api/v1/software', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.patch('/api/v1/software/:softwareId', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.delete('/api/v1/software/:softwareId', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.get('/api/v1/vms/:vmId/virtualization', authMiddleware, verifyMiddleware, coreApiProxy);
router.post('/api/v1/vms/:vmId/virtualization/enable', authMiddleware, verifyMiddleware, coreApiProxy);
router.post('/api/v1/vms/:vmId/virtualization/disable', authMiddleware, verifyMiddleware, coreApiProxy);

// ─── NOTIFICATION ROUTES (admin + super_admin) ───────────────────────────────
router.get('/api/v1/notifications', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.get('/api/v1/notifications/unread-count', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.patch('/api/v1/notifications/read-all', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.patch('/api/v1/notifications/:notificationId/read', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);

// ─── VM AUTOMATION ROUTES (admin + super_admin) ─────────────────────────────
router.get('/api/v1/vm-automations', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.post('/api/v1/vm-automations', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.get('/api/v1/vm-automations/:automationId', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.patch('/api/v1/vm-automations/:automationId', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.delete('/api/v1/vm-automations/:automationId', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);

// ─── EXTERNAL VM ROUTES (admin + super_admin) ────────────────────────────────
router.post('/api/v1/external-vms/bulk', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.post('/api/v1/external-vms', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.get('/api/v1/external-vms', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.get('/api/v1/external-vms/:id/console', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.get('/api/v1/external-vms/:id', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.delete('/api/v1/external-vms/:id', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);

// ─── MANAGED USERS ROUTES (admin + super_admin) ──────────────────────────────
router.post('/api/v1/managed-users/single', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.post('/api/v1/managed-users/bulk', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.get('/api/v1/managed-users', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.patch('/api/v1/managed-users/:userId/active', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.delete('/api/v1/managed-users/:userId', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);

// ─── CATCH-ALL PROTECTED PROXY ────────────────────────────────────────────────
// Any other /api/v1/* route requires auth + verify
router.use('/api/v1', authMiddleware, verifyMiddleware, coreApiProxy);

export default router;
