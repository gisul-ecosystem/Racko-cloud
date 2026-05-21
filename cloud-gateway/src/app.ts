import express from 'express';
import cors from 'cors';
import { helmetMiddleware } from './middleware/helmet.middleware';
import { requestIdMiddleware } from './middleware/requestId.middleware';
import { loggerMiddleware } from './middleware/logger.middleware';
import { globalRateLimiter } from './middleware/rateLimit.middleware';
import { corsOptions } from './config/cors';
import { GatewayError } from './utils/errors';
import { logger } from './utils/logger';
import { config } from './config';
import proxyRoutes from './routes/proxy.routes';

const app = express();

// ─── SECURITY MIDDLEWARE STACK (exact order) ──────────────────────────────────

// 1. Request ID — attach UUID to every request
app.use(requestIdMiddleware);

// 2. Helmet — all security headers
app.use(helmetMiddleware);

// 3. CORS — strict origin whitelist
app.use(cors(corsOptions));

// 4. Morgan/logger — request logging
app.use(loggerMiddleware);

// 5. Global rate limit
app.use(globalRateLimiter);

// NOTE: No body parsing on the gateway — request bodies are forwarded raw to
// microservices. Body parsing, sanitization (mongoSanitize, hpp) and validation
// happen in each microservice. This is standard API gateway architecture.

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'cloud-gateway' });
});

// ─── PROXY ROUTES ─────────────────────────────────────────────────────────────
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
