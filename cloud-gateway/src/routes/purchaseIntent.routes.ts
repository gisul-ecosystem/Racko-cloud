import { Router, type Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { config } from '../config';

const router = Router();

/** Public proxy for purchase-intent email links (token auth on cloud_automation). */
const purchaseIntentProxy = createProxyMiddleware({
  target: config.CLOUD_AUTOMATION_URL,
  changeOrigin: true,
  timeout: config.REQUEST_TIMEOUT_MS,
  pathRewrite: (path) => {
    const suffix = path.startsWith('/api/purchase-intent')
      ? path.slice('/api/purchase-intent'.length) || '/'
      : path;
    return `/api/purchase-intent${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
  },
  on: {
    error: (_err, _req, res) => {
      (res as Response).status(502).json({
        success: false,
        message: 'Purchase intent service temporarily unavailable.',
        code: 'BAD_GATEWAY',
      });
    },
  },
});

router.use('/api/purchase-intent', purchaseIntentProxy);

export default router;
