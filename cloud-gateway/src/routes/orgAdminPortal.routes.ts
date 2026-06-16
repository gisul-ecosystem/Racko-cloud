import { Router, type Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { config } from '../config';

const router = Router();

/** Public proxy for organization admin portal (session auth on cloud_automation). */
const orgAdminPortalProxy = createProxyMiddleware({
  target: config.CLOUD_AUTOMATION_URL,
  changeOrigin: true,
  timeout: config.REQUEST_TIMEOUT_MS,
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

router.use('/api/org-admin', orgAdminPortalProxy);

export default router;
