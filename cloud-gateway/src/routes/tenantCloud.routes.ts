import { Router, type Request, type Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { config } from '../config';
import { ForbiddenError } from '../utils/errors';
import { logger } from '../utils/logger';
import { requireTenantBearer } from '../middleware/tenantAuth.middleware';
import {
  injectTenantCloudUserHeaders,
  requireTenantAdminRole,
  requireTenantAssignedService,
} from '../middleware/tenantCloud.middleware';

const router = Router();

const AZURE_PREFIX = '/api/v1/tenant-cloud/azure';
const AWS_PREFIX = '/api/v1/tenant-cloud/aws';

/**
 * Allowlist only the surfaces the tenant portal needs.
 * Deny-by-default blocks org-admin, cleanup, jobs, manage, etc.
 */
const AZURE_ALLOWED_SUFFIXES = [
  /^\/health$/,
  /^\/requests\/?$/,
  /^\/requests\/\d+$/,
  /^\/requests\/\d+\/cleanup-schedule$/,
  /^\/services(\/[\w%-]+)*\/?$/,
  /^\/pricing(\/[\w%-]+)*\/?$/,
  /^\/azure\/licenses\/?$/,
  /^\/purchase-intent\/(clone|respond)\/?$/,
  /^\/provision\/request\/\d+(\/[\w%-]+)*\/?$/,
  /^\/admin-access-requests\/?$/,
  /^\/privileged-role-requests\/?$/,
  /^\/privileged-role-requests\/roles\/?$/,
  /^\/notifications(\/[\w%-]+)*\/?$/,
];

const AWS_ALLOWED_SUFFIXES = [
  /^\/health$/,
  /^\/categories\/?$/,
  /^\/services\/?$/,
  /^\/pricing(\/[\w%-]+)*\/?$/,
  /^\/regions\/?$/,
  /^\/available-regions\/?$/,
  /^\/purchase-intent\/(clone|respond)\/?$/,
  /^\/requests\/?$/,
  /^\/requests\/[\w-]+$/,
  /^\/requests\/[\w-]+\/spend$/,
  /^\/requests\/[\w-]+\/sync-spend$/,
  /^\/requests\/[\w-]+\/users\/\d+\/reinstate$/,
  /^\/provision\/request\/[\w-]+\/(start|status|retry)\/?$/,
  /^\/privileged-role-requests\/?$/,
  /^\/privileged-role-requests\/roles\/?$/,
  /^\/notifications(\/[\w%-]+)*\/?$/,
];

function getTenantCloudSuffix(fullPath: string): string | null {
  if (fullPath.startsWith(AZURE_PREFIX)) {
    return fullPath.slice(AZURE_PREFIX.length) || '/';
  }
  if (fullPath.startsWith(AWS_PREFIX)) {
    return fullPath.slice(AWS_PREFIX.length) || '/';
  }
  return null;
}

function allowOnlyTenantCloudPaths(provider: 'azure' | 'aws') {
  const patterns = provider === 'azure' ? AZURE_ALLOWED_SUFFIXES : AWS_ALLOWED_SUFFIXES;

  return (req: Request, _res: Response, next: (err?: unknown) => void): void => {
    const fullPath = (req.originalUrl.split('?')[0] ?? req.originalUrl).replace(/\/+$/, '') || '/';
    const suffix = getTenantCloudSuffix(fullPath);
    if (!suffix) {
      return next(new ForbiddenError('Invalid tenant cloud path.'));
    }

    const normalized = suffix === '' ? '/' : suffix;
    if (!patterns.some((pattern) => pattern.test(normalized))) {
      return next(
        new ForbiddenError('This cloud automation endpoint is not available for tenant accounts.')
      );
    }

    next();
  };
}

function rewriteTenantCloudPath(gatewayPrefix: string) {
  return (path: string): string => {
    let suffix = path;
    if (path.startsWith(gatewayPrefix)) {
      suffix = path.slice(gatewayPrefix.length);
    }

    if (!suffix || suffix === '/') {
      return '/api';
    }

    if (suffix.startsWith('/health')) {
      return suffix === '/health' ? '/health' : suffix;
    }

    return `/api${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
  };
}

function createTenantCloudProxy(target: string, gatewayPrefix: string, timeoutMs: number) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    timeout: timeoutMs,
    proxyTimeout: timeoutMs,
    pathRewrite: rewriteTenantCloudPath(gatewayPrefix),
    on: {
      error: (err, req, res) => {
        logger.error('Tenant cloud proxy error', {
          target,
          path: (req as Request).originalUrl ?? (req as Request).url,
          message: err instanceof Error ? err.message : String(err),
        });
        (res as Response).status(502).json({
          success: false,
          message: 'Cloud automation service temporarily unavailable.',
          code: 'BAD_GATEWAY',
        });
      },
    },
  });
}

const azureProxy = createTenantCloudProxy(
  config.CLOUD_AUTOMATION_URL,
  AZURE_PREFIX,
  0
);

const awsProxy = createTenantCloudProxy(
  config.CLOUD_AUTOMATION_AWS_URL,
  AWS_PREFIX,
  Math.max(config.AWS_REQUEST_TIMEOUT_MS, config.REQUEST_TIMEOUT_MS, 120_000)
);

router.use(
  AZURE_PREFIX,
  requireTenantBearer,
  requireTenantAdminRole,
  requireTenantAssignedService('azure'),
  injectTenantCloudUserHeaders,
  allowOnlyTenantCloudPaths('azure'),
  azureProxy
);

router.use(
  AWS_PREFIX,
  requireTenantBearer,
  requireTenantAdminRole,
  requireTenantAssignedService('aws'),
  injectTenantCloudUserHeaders,
  allowOnlyTenantCloudPaths('aws'),
  awsProxy
);

export default router;
