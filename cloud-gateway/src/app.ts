import express from 'express';
import cors from 'cors';
import { helmetMiddleware } from './middleware/helmet.middleware';
import { requestIdMiddleware } from './middleware/requestId.middleware';
import { tenantResolver } from './middleware/tenant.middleware';
import { loggerMiddleware } from './middleware/logger.middleware';
import { userRateLimiter } from './middleware/rateLimit.middleware';
import { corsOptions } from './config/cors';
import { GatewayError } from './utils/errors';
import { logger } from './utils/logger';
import { config } from './config';
import cloudAutomationRoutes from './routes/cloudAutomation.routes';
import cloudAutomationAwsRoutes from './routes/cloudAutomationAws.routes';
import cloudAutomationGcpRoutes from './routes/cloudAutomationGcp.routes';
import managePortalRoutes from './routes/managePortal.routes';
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

// 4. Morgan/logger — request logging
app.use(loggerMiddleware);

// 5. User ID-based rate limit — per-user independent buckets, falls back to IP for unauthenticated requests
// Skip rate limiting for auth token endpoints, long-lived streams, and high-frequency
// authenticated cloud automation traffic (provisioning polls many endpoints in parallel).
const RATE_LIMIT_SKIP_PATHS = new Set(['/api/v1/auth/refresh', '/api/v1/auth/validate']);

const RATE_LIMIT_SKIP_PREFIXES = [
  '/api/v1/agent/',
  '/api/v1/cloud-automation',
  '/api/v1/cloud-automation-aws',
  '/api/v1/cloud-automation-gcp',
  '/api/v1/tenant-cloud',
  '/api/org-admin',
  '/api/manage',
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

// ─── PROXY ROUTES ─────────────────────────────────────────────────────────────
// Manage-users portal (public; session auth enforced by cloud_automation)
app.use(managePortalRoutes);
// Organization admin APIs (JWT super_admin; enforced by cloud_automation)
app.use(orgAdminPortalRoutes);
// Tenant cloud automation (tenant JWT + assigned service → azure/aws services)
app.use(tenantCloudRoutes);
// Cloud automation AWS/GCP — register before Azure routes because
// /api/v1/cloud-automation-aws and /api/v1/cloud-automation-gcp are prefixes of /api/v1/cloud-automation.
app.use(cloudAutomationAwsRoutes);
app.use(cloudAutomationGcpRoutes);
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
