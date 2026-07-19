import { Router, type Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { config } from '../config';

const router = Router();

/** Public proxy for lab customer manage-users portal (token/session auth on cloud_automation). */
const managePortalProxy = createProxyMiddleware({
  target: config.CLOUD_AUTOMATION_URL,
  changeOrigin: true,
  timeout: config.REQUEST_TIMEOUT_MS,
  pathRewrite: (path) => {
    const suffix = path.startsWith('/api/manage')
      ? path.slice('/api/manage'.length) || '/'
      : path;
    return `/api/manage${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
  },
  on: {
    error: (_err, _req, res) => {
      (res as Response).status(502).json({
        success: false,
        message: 'Manage portal service temporarily unavailable.',
        code: 'BAD_GATEWAY',
      });
    },
  },
});

router.use('/api/manage', managePortalProxy);

export default router;
