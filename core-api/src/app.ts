import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config';
import { logger } from './utils/logger';
import { sanitizeInput } from './middleware/sanitize.middleware';
import { globalErrorHandler, notFoundHandler } from './middleware/error.middleware';
import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/user/user.routes';
import proxmoxRoutes from './modules/proxmox/proxmox.routes';
import vmRoutes from './modules/vm/vm.routes';
import { startNodeMonitoring } from './modules/proxmox/proxmox.service';

const app = express();

// 1. Request ID — attach UUID to every request for distributed tracing
app.use((req, res, next) => {
  const requestId = uuidv4();
  (req as express.Request & { requestId: string }).requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
});

// 2. Helmet — all security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    dnsPrefetchControl: { allow: false },
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    ieNoOpen: true,
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true,
  })
);

// 3. CORS — strict origin whitelist, no wildcards
const allowedOrigins = config.NODE_ENV === 'development'
  ? ['http://localhost:3000', 'http://localhost:3001']
  : [config.FRONTEND_URL];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, curl in dev)
      if (!origin && config.NODE_ENV === 'development') return callback(null, true);
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Internal-Secret'],
    exposedHeaders: ['X-Request-ID'],
    maxAge: 86400,
  })
);

// 4. Body parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// 5. Cookie parser
app.use(cookieParser());

// 6. express-mongo-sanitize — prevent NoSQL injection
app.use(mongoSanitize({ replaceWith: '_' }));

// 7. HPP — prevent HTTP parameter pollution
app.use(hpp());

// 8. Input sanitization — strip HTML
app.use(sanitizeInput);

// 9. Morgan request logging
app.use(
  morgan('combined', {
    stream: { write: (message) => logger.info(message.trim()) },
    skip: (req) => req.path === '/health',
  })
);

// 10. Global rate limit
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, message: 'Too many requests.', code: 'RATE_LIMITED' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

// Health check
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'core-api' });
});

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/proxmox', proxmoxRoutes);
app.use('/api/v1/vms', vmRoutes);

// Start node monitoring (runs in background — never blocks startup)
startNodeMonitoring();

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(globalErrorHandler);

export default app;
