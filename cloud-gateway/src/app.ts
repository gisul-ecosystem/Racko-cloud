import express from 'express';
import cors from 'cors';
import { helmetMiddleware } from './middleware/helmet.middleware';
import { requestIdMiddleware } from './middleware/requestId.middleware';
import { tenantResolver } from './middleware/tenant.middleware';
import { ipAccessGuard } from './middleware/ipAccessGuard.middleware';
import { loggerMiddleware } from './middleware/logger.middleware';
import { userRateLimiter } from './middleware/rateLimit.middleware';
import { corsOptions } from './config/cors';
import { GatewayError } from './utils/errors';
import { logger } from './utils/logger';
import { config } from './config';
import cloudAutomationRoutes from './routes/cloudAutomation.routes';
import cloudAutomationAwsRoutes from './routes/cloudAutomationAws.routes';
import cloudAutomationGcpRoutes from './routes/cloudAutomationGcp.routes';
import cloudAutomationTrainingRoutes from './routes/cloudAutomationTraining.routes';
import managePortalRoutes from './routes/managePortal.routes';
import purchaseIntentRoutes from './routes/purchaseIntent.routes';
import orgAdminPortalRoutes from './routes/orgAdminPortal.routes';
import tenantCloudRoutes from './routes/tenantCloud.routes';
import proxyRoutes from './routes/proxy.routes';

const app = express();

// ─── SECURITY MIDDLEWARE STACK (exact orders) ────────────────────────────────── 

// 1. Request ID — attach UUID to every request
app.use(requestIdMiddleware);

// 2. Helmet — all security headers
app.use(helmetMiddleware);

// 3. CORS — strict origin whitelist
app.use(cors(corsOptions));

// 3b. Tenant host resolution (non-blocking; sets req.tenantContext)
app.use(tenantResolver);

// 3c. IP access guard — enforces per-tenant IP allowlist when mode is 'restricted'
app.use(ipAccessGuard);

// 4. Morgan/logger — request logging
app.use(loggerMiddleware);

// 5. User ID-based rate limit — per-user independent buckets, falls back to IP for unauthenticated requests
// Skip rate limiting for auth token endpoints, long-lived streams, and high-frequency
// authenticated cloud automation traffic (provisioning polls many endpoints in parallel).
const RATE_LIMIT_SKIP_PATHS = new Set(['/api/v1/auth/refresh', '/api/v1/auth/validate', '/api/health']);

const RATE_LIMIT_SKIP_PREFIXES = [
  '/api/v1/agent/',
  '/api/v1/cloud-automation',
  '/api/v1/cloud-automation-aws',
  '/api/v1/cloud-automation-gcp',
  '/api/v1/cloud-automation-training',
  '/api/v1/tenant-cloud',
  '/api/org-admin',
  '/api/manage',
  '/api/purchase-intent',
];

function isRateLimitExemptPath(path: string): boolean {
  if (RATE_LIMIT_SKIP_PATHS.has(path)) return true;
  if (RATE_LIMIT_SKIP_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  // SSE / push streams are long-lived and must not be rate limited
  if (path.includes('/push-stream') || path.includes('/stream')) return true;
  // Local development — avoid blocking dashboards during provisioning tests
  if (config.NODE_ENV === 'development') return true;
  return false;
}

app.use((req, res, next) => {
  if (isRateLimitExemptPath(req.path)) return next();
  return userRateLimiter(req, res, next);
});

// NOTE: No body parsing on the gateway — request bodies are forwarded raw to
// microservices. Body parsing, sanitization (mongoSanitize, hpp) and validation
// happen in each microservice. This is standard API gateway architecture.

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'cloud-gateway' });
});

// ─── NGINX AUTH_REQUEST ENDPOINT ──────────────────────────────────────────────
// Called by Nginx before serving any page on tenant domains.
// Uses the tenant context already resolved by tenantResolver (cached 30s).
// Returns 200 = allow, 403 = block. No body needed — Nginx only reads the status.
// Fails open (200) when there is no tenant context so the main platform domain
// is never affected.
app.get('/internal/ip-check', (req, res) => {
  const gatewayReq = req as import('./types').GatewayRequest;
  const ctx = gatewayReq.tenantContext;

  // No tenant context = main platform domain or unresolved host → allow
  if (!ctx) {
    res.status(200).end();
    return;
  }

  // Mode 'all' → public access
  if (ctx.ipAccessMode !== 'restricted') {
    res.status(200).end();
    return;
  }

  // Dev mode → always allow
  if (config.NODE_ENV === 'development') {
    res.status(200).end();
    return;
  }

  // Resolve client IP from X-Forwarded-For (set by Nginx) — same logic as ipAccessGuard
  const xff = req.headers['x-forwarded-for'];
  let clientIp: string | null = null;
  if (xff) {
    const first = (Array.isArray(xff) ? xff[0] : xff).split(',')[0]?.trim();
    if (first) clientIp = first;
  }
  if (!clientIp) clientIp = req.ip ?? null;

  if (!clientIp) {
    res.status(403).end();
    return;
  }

  // Re-use the isIpAllowed logic from ipAccessGuard via a lightweight inline check
  // (avoids importing the private function — same logic duplicated intentionally small)
  const { allowedIps } = ctx;

  if (allowedIps.length === 0) {
    res.status(403).end();
    return;
  }

  // Normalise ::ffff: mapped IPv4
  const ip = clientIp.toLowerCase().startsWith('::ffff:')
    ? clientIp.slice(7)
    : clientIp.split('%')[0] ?? clientIp;

  const allowed = allowedIps.some((entry) => {
    const e = entry.trim();
    if (!e) return false;
    // Exact match
    if (ip.toLowerCase() === e.toLowerCase()) return true;
    // IPv4 CIDR
    if (e.includes('/') && !e.includes(':')) {
      const [network, prefixStr] = e.split('/');
      if (!network || !prefixStr) return false;
      const prefix = parseInt(prefixStr, 10);
      if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;
      const toInt = (s: string) => {
        const p = s.split('.');
        if (p.length !== 4) return null;
        let r = 0;
        for (const x of p) { const n = parseInt(x, 10); if (isNaN(n) || n < 0 || n > 255) return null; r = (r << 8) | n; }
        return r >>> 0;
      };
      const ipInt = toInt(ip); const netInt = toInt(network);
      if (ipInt === null || netInt === null) return false;
      const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
      return (ipInt & mask) >>> 0 === (netInt & mask) >>> 0;
    }
    return false;
  });

  res.status(allowed ? 200 : 403).end();
});

// ─── PROXY ROUTES ─────────────────────────────────────────────────────────────
// Manage-users portal (public; session auth enforced by cloud_automation)
app.use(managePortalRoutes);
// Purchase-intent email links (public; token auth enforced by cloud_automation)
app.use(purchaseIntentRoutes);
// Organization admin APIs (JWT super_admin; enforced by cloud_automation)
app.use(orgAdminPortalRoutes);
// Tenant cloud automation (tenant JWT + assigned service → azure/aws services)
app.use(tenantCloudRoutes);
// Cloud automation AWS/GCP/training — register before Azure routes because
// /api/v1/cloud-automation-aws, -gcp, and -training are prefixes of /api/v1/cloud-automation.
app.use(cloudAutomationAwsRoutes);
app.use(cloudAutomationGcpRoutes);
app.use(cloudAutomationTrainingRoutes);
// Cloud automation (Type 1 admin APIs) — must register before core-api catch-all
app.use(cloudAutomationRoutes);
app.use(proxyRoutes);

// ─── ERROR HANDLER ────────────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Gateway error', {
    message: err.message,
    code: err instanceof GatewayError ? err.code : 'INTERNAL_ERROR',
    ...(config.NODE_ENV === 'development' && { stack: err.stack }),
  });

  if (err instanceof GatewayError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code: err.code,
    });
    return;
  }

  res.status(500).json({
    success: false,
    message: config.NODE_ENV === 'production' ? 'An unexpected error occurred.' : err.message,
    code: 'INTERNAL_ERROR',
  });
});

export default app;
