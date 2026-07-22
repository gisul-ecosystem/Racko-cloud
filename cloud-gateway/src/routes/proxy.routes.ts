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
import { injectTenantHeader, requireTenantBearer } from '../middleware/tenantAuth.middleware';
import { logger } from '../utils/logger';

const router = Router();

const AUTH_TOKEN_PATHS = new Set([
  '/api/v1/auth/login',
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
]);

function getCookieNames(cookieHeader: string | undefined): string[] {
  if (!cookieHeader) return [];
  return cookieHeader
    .split(';')
    .map((part) => part.trim().split('=')[0] ?? '')
    .filter((name) => name.length > 0);
}

function logGatewayAuthToken(
  phase: string,
  req: Request,
  extra: Record<string, unknown> = {}
): void {
  if (!AUTH_TOKEN_PATHS.has(req.path)) return;

  const cookieHeader = req.headers.cookie ?? '';
  logger.info(`[auth-token] gateway:${phase}`, {
    path: req.path,
    method: req.method,
    origin: req.headers.origin ?? null,
    cookieHeaderPresent: cookieHeader.length > 0,
    cookieNames: getCookieNames(cookieHeader),
    hasRefreshTokenCookie: cookieHeader.includes('refreshToken='),
    ...extra,
  });
}

const proxyOnHandlers = {
  proxyReq: (proxyReq: import('http').ClientRequest, req: Request) => {
    logGatewayAuthToken('proxyReq', req, {
      cookieHeaderForwarded: !!(proxyReq.getHeader('cookie') ?? req.headers.cookie),
    });
  },
  proxyRes: (proxyRes: import('http').IncomingMessage, req: Request) => {
    const setCookie = proxyRes.headers['set-cookie'];
    if (setCookie) {
      proxyRes.headers['set-cookie'] = setCookie.map((cookie) =>
        cookie
          .replace(/;\s*Domain=[^;]*/gi, '')
          .replace(/;\s*Path=[^;]*/gi, '; Path=/')
      );
    }

    logGatewayAuthToken('proxyRes', req, {
      statusCode: proxyRes.statusCode ?? null,
      setCookieCount: setCookie?.length ?? 0,
      setRefreshTokenCookie: Array.isArray(setCookie)
        ? setCookie.some((cookie) => cookie.startsWith('refreshToken='))
        : false,
    });
  },
  error: (_err: Error, _req: unknown, res: unknown) => {
    (res as Response).status(502).json({
      success: false,
      message: 'Service temporarily unavailable.',
      code: 'BAD_GATEWAY',
    });
  },
};

const sharedProxyOptions = {
  target: config.CORE_API_URL,
  changeOrigin: true,
  timeout: config.REQUEST_TIMEOUT_MS,
  cookieDomainRewrite: { '*': '' } as const,
  cookiePathRewrite: { '*': '/' } as const,
  on: proxyOnHandlers,
};

// Explicit routes use the full path — no rewrite needed
const coreApiProxy = createProxyMiddleware(sharedProxyOptions);

// Catch-all mounted at /api/v1 — Express strips that prefix from req.url before
// the proxy runs, so we must restore it for core-api routes like /api/v1/tenants
const coreApiCatchAllProxy = createProxyMiddleware({
  ...sharedProxyOptions,
  pathRewrite: (path) => `/api/v1${path}`,
});

/** router.use('/api/v1/foo', proxy) strips the mount — restore full path for core-api */
function createMountedCoreApiProxy(mountPath: string) {
  return createProxyMiddleware({
    ...sharedProxyOptions,
    pathRewrite: (path) => `${mountPath}${path === '/' ? '' : path}`,
  });
}

const tenantWalletProxy = createMountedCoreApiProxy('/api/v1/tenant-wallet');
const tenantServicesProxy = createMountedCoreApiProxy('/api/v1/tenant-services');
const tenantOrdersProxy = createMountedCoreApiProxy('/api/v1/tenant-orders');
const tenantPlansProxy = createMountedCoreApiProxy('/api/v1/tenant-plans');
const tenantNotificationsProxy = createMountedCoreApiProxy('/api/v1/tenant-notifications');
const tenantUsersProxy = createMountedCoreApiProxy('/api/v1/tenant-users');
const tenantVmsProxy = createMountedCoreApiProxy('/api/v1/tenant-vms');
const tenantExternalVmsProxy = createMountedCoreApiProxy('/api/v1/tenant-external-vms');
const tenantVmCatalogProxy = createMountedCoreApiProxy('/api/v1/tenant-vm-catalog');
const tenantDedicatedServersProxy = createMountedCoreApiProxy('/api/v1/tenant-dedicated-servers');

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
router.post('/api/v1/auth/forgot-password', coreApiProxy);
router.post('/api/v1/auth/reset-password', coreApiProxy);

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
router.patch('/api/v1/vms/jobs/:jobId/cancel', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.get('/api/v1/vms/clones', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
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
router.post('/api/v1/vms/:vmId/clone', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);

// ─── SOFTWARE ROUTES ──────────────────────────────────────────────────────────
router.get('/api/v1/software', authMiddleware, verifyMiddleware, coreApiProxy);
router.get('/api/v1/software/all', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.post('/api/v1/software', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.patch('/api/v1/software/:softwareId', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.delete('/api/v1/software/:softwareId', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
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

// ─── ADMIN VM TEMPLATE ROUTES (admin + super_admin) ──────────────────────────
// SSE stream route — NO gateway auth. core-api verifies the ?streamToken= ticket.
// Must be registered before other :templateId routes to avoid being shadowed.
// Dedicated proxy — no shared proxyRes handler; SSE body must pass through untouched.
const sseProxy = createProxyMiddleware({
  target: config.CORE_API_URL,
  changeOrigin: true,
  timeout: 0,
  proxyTimeout: 0,
  selfHandleResponse: false,
  on: {
    error: proxyOnHandlers.error,
  },
});
router.get('/api/v1/admin-vm-templates/:templateId/stream', sseProxy);

router.get('/api/v1/admin-vm-templates', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.post('/api/v1/admin-vm-templates', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.post('/api/v1/admin-vm-templates/:templateId/stream-ticket', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.delete('/api/v1/admin-vm-templates/:templateId', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);

// ─── EXTERNAL VM ROUTES ────────────────────────────────────────────────────────
router.post('/api/v1/external-vms/bulk', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.post('/api/v1/external-vms', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.get('/api/v1/external-vms/assign/available', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.get('/api/v1/external-vms/assign/counts', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.get('/api/v1/external-vms/assign/user/:userId', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.post('/api/v1/external-vms/assign', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.post('/api/v1/external-vms/assign/bulk', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.delete('/api/v1/external-vms/assign/:id', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.get('/api/v1/external-vms/my-assigned', authMiddleware, verifyMiddleware, requireRole('user'), coreApiProxy);
router.get('/api/v1/external-vms', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.get('/api/v1/external-vms/:id/console', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin', 'user'), coreApiProxy);
router.get('/api/v1/external-vms/:id', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin', 'user'), coreApiProxy);
router.delete('/api/v1/external-vms/:id', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);

// ─── EXTERNAL VM PRICING (sell multipliers / overrides) ──────────────────────
router.get('/api/v1/external-vm-pricing/:provider', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.put('/api/v1/external-vm-pricing/:provider', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);

// ─── VM CATALOG ROUTES (admin + super_admin) ─────────────────────────────────
router.get('/api/v1/vm-catalog/overview', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.get('/api/v1/vm-catalog/plans', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.post('/api/v1/vm-catalog/plans', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.post('/api/v1/vm-catalog/plans/seed', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.patch('/api/v1/vm-catalog/plans/:id', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.delete('/api/v1/vm-catalog/plans/:id', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.get('/api/v1/vm-catalog/vms', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.get('/api/v1/vm-catalog/vms/:id', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.get('/api/v1/vm-catalog/vms/:id/console', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.post('/api/v1/vm-catalog/requests', authMiddleware, verifyMiddleware, requireRole('admin'), coreApiProxy);
router.get('/api/v1/vm-catalog/requests/requesters', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.get('/api/v1/vm-catalog/requests', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.patch('/api/v1/vm-catalog/requests/:id/approve', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.patch('/api/v1/vm-catalog/requests/:id/fetch-details', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.patch('/api/v1/vm-catalog/requests/:id/attach', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.patch('/api/v1/vm-catalog/requests/:id/change-template', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.post('/api/v1/vm-catalog/requests/:id/power', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.patch('/api/v1/vm-catalog/requests/:id/reject', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);

router.get('/api/v1/dedicated-servers/plans', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.post('/api/v1/dedicated-servers/plans', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.post('/api/v1/dedicated-servers/plans/seed', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.get('/api/v1/dedicated-servers/pricing-settings', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.put('/api/v1/dedicated-servers/pricing-settings', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.patch('/api/v1/dedicated-servers/plans/:id', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.delete('/api/v1/dedicated-servers/plans/:id', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.get('/api/v1/dedicated-servers/servers', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.get('/api/v1/dedicated-servers/servers/:id', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.get('/api/v1/dedicated-servers/servers/:id/console', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.post('/api/v1/dedicated-servers/requests', authMiddleware, verifyMiddleware, requireRole('admin'), coreApiProxy);
router.get('/api/v1/dedicated-servers/requests/requesters', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.get('/api/v1/dedicated-servers/requests', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.patch('/api/v1/dedicated-servers/requests/:id/attach', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.patch('/api/v1/dedicated-servers/requests/:id/reject', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);

router.get('/api/v1/admin-services/me', authMiddleware, verifyMiddleware, requireRole('admin'), coreApiProxy);
router.get('/api/v1/admin-services/catalog', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.get('/api/v1/admin-services/admins/:adminId', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.post('/api/v1/admin-services/admins/:adminId', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.patch('/api/v1/admin-services/admins/:adminId/:serviceKey', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.delete('/api/v1/admin-services/admins/:adminId/:serviceKey', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);

// ─── MANAGED USERS ROUTES (admin + super_admin) ──────────────────────────────
router.post('/api/v1/managed-users/single', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.post('/api/v1/managed-users/bulk', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.get('/api/v1/managed-users', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.patch('/api/v1/managed-users/:userId/active', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.delete('/api/v1/managed-users/:userId', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);

// ─── MACHINE MANAGER ROUTES (admin + super_admin) ────────────────────────────
// Static sub-routes must come before /:id to avoid collision
router.post('/api/v1/machines/push-agent', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.post('/api/v1/machines/push-stream-ticket', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
// SSE stream for push status — NO gateway auth. core-api validates the ?streamToken= ticket internally.
router.get('/api/v1/machines/push-stream/:sessionId', sseProxy);
router.post('/api/v1/machines/bulk', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.post('/api/v1/machines/jobs', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.get('/api/v1/machines/jobs', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.post('/api/v1/machines/jobs/:id/stream-ticket', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
// SSE stream — NO gateway auth. core-api validates the ?streamToken= ticket internally.
router.get('/api/v1/machines/jobs/:id/stream', sseProxy);
router.get('/api/v1/machines/jobs/:id', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
// Public download-agent redeem — no auth, token validated internally (single-use, 60s TTL)
router.get('/api/v1/machines/download-agent', coreApiProxy);
router.post('/api/v1/machines', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.get('/api/v1/machines', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
// Issue download token — authenticated
router.post('/api/v1/machines/:id/download-agent/token', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.get('/api/v1/machines/:id/download-agent', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.post('/api/v1/machines/:id/exec', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.get('/api/v1/machines/:id', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.delete('/api/v1/machines/:id', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);

// ─── SOFTWARE CATALOG ROUTES ──────────────────────────────────────────────────
router.get('/api/v1/software-catalog', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.get('/api/v1/software-catalog/:id', authMiddleware, verifyMiddleware, requireRole('admin', 'super_admin'), coreApiProxy);
router.post('/api/v1/software-catalog', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);
router.delete('/api/v1/software-catalog/:id', authMiddleware, verifyMiddleware, requireRole('super_admin'), coreApiProxy);

// ─── AGENT ROUTES (no JWT auth — agent uses accountToken in body) ─────────────
router.post('/api/v1/agent/register', coreApiProxy);
router.post('/api/v1/agent/enroll', coreApiProxy);
router.get('/api/v1/agent/binary/:os', coreApiProxy);
router.get('/api/v1/agent/install/linux', coreApiProxy);
router.get('/api/v1/agent/connect', coreApiProxy); // WebSocket upgrade — handled via server.on('upgrade') in server.ts
router.get('/api/v1/agent/jobs/:agentId', coreApiProxy);
router.post('/api/v1/agent/jobs/:jobId/result', coreApiProxy);
router.post('/api/v1/agent/heartbeat', coreApiProxy);
router.get('/api/v1/agent/software-catalog/:id', coreApiProxy);
// ─── TENANT PUBLIC ROUTES (host → x-tenant-id; no platform JWT) ───────────────
router.post('/api/v1/tenant-auth/login', injectTenantHeader, coreApiProxy);
router.post('/api/v1/tenant-auth/forgot-password', injectTenantHeader, coreApiProxy);
router.post('/api/v1/tenant-auth/reset-password', injectTenantHeader, coreApiProxy);
router.get('/api/v1/tenant-branding', injectTenantHeader, coreApiProxy);
router.get('/api/v1/tenant-branding/asset', injectTenantHeader, coreApiProxy);

// Razorpay wallet webhook (no auth; signature verified by core-api)
router.post('/webhooks/razorpay', coreApiProxy);
router.get('/webhooks/razorpay/test', coreApiProxy);
router.post('/webhooks/razorpay/test-credit', coreApiProxy);

// ─── TENANT AUTHENTICATED ROUTES (tenant JWT; not platform verify) ───────────
router.use('/api/v1/tenant-wallet', requireTenantBearer, tenantWalletProxy);
router.use('/api/v1/tenant-services', requireTenantBearer, tenantServicesProxy);
router.use('/api/v1/tenant-orders', requireTenantBearer, tenantOrdersProxy);
router.use('/api/v1/tenant-plans', requireTenantBearer, tenantPlansProxy);
router.use('/api/v1/tenant-notifications', requireTenantBearer, tenantNotificationsProxy);
router.use('/api/v1/tenant-users', requireTenantBearer, tenantUsersProxy);
router.use('/api/v1/tenant-vms', requireTenantBearer, tenantVmsProxy);
router.use('/api/v1/tenant-external-vms', requireTenantBearer, tenantExternalVmsProxy);
router.use('/api/v1/tenant-vm-catalog', requireTenantBearer, tenantVmCatalogProxy);
router.use('/api/v1/tenant-dedicated-servers', requireTenantBearer, tenantDedicatedServersProxy);

// ─── CATCH-ALL PROTECTED PROXY ────────────────────────────────────────────────
// Any other /api/v1/* route requires auth + verify
router.use('/api/v1', authMiddleware, verifyMiddleware, coreApiCatchAllProxy);

export default router;
