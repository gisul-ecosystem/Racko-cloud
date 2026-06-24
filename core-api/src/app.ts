import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config';
import { logger } from './utils/logger';
import { sanitizeInput } from './middleware/sanitize.middleware';
import { globalErrorHandler, notFoundHandler } from './middleware/error.middleware';
import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/user/user.routes';
import proxmoxRoutes from './modules/proxmox/proxmox.routes';
import vmRoutes from './modules/vm/vm.routes';
import externalVmRoutes from './modules/external-vm/external-vm.routes';
import managedUsersRoutes from './modules/managedUsers/managedUsers.routes';
import softwareRoutes from './modules/software/software.routes';
import vmAutomationRoutes from './modules/vmAutomation/vmAutomation.routes';
import notificationRoutes from './modules/notification/notification.routes';
import adminVmTemplateRoutes from './modules/adminVmTemplate/adminVmTemplate.routes';
import internalTenantRoutes from './modules/tenant/internalTenant.routes';
import tenantRoutes from './modules/tenant/tenant.routes';
import tenantBrandingRoutes from './modules/tenant/tenantBranding.routes';
import tenantAuthRoutes from './modules/tenantAuth/tenantAuth.routes';
import superAdminRoutes from './modules/superAdmin/superAdmin.routes';
import walletRoutes from './modules/wallet/wallet.routes';
import orderRoutes from './modules/order/order.routes';
import superAdminOrderRoutes from './modules/order/superAdminOrder.routes';
import razorpayWebhookRoutes from './modules/billing/razorpay/razorpayWebhook.routes';
import { startNodeMonitoring } from './modules/proxmox/proxmox.service';
import { startHyperVSweeper } from './modules/vm/helpers/hypervSweeper';
import { startStorageReconcileSweeper } from './modules/vm/helpers/storageReconcileSweeper';
import { startVmAutomationScheduler } from './modules/vmAutomation/vmAutomationScheduler';
import tenantPlanRoutes from './modules/tenantPlan/tenantPlan.routes';
import tenantNotificationRoutes from './modules/tenantNotification/tenantNotification.routes';
import { startPlanExpiryScheduler } from './modules/vm/helpers/planExpiryScheduler';
import { startPlanExpiryWarningScheduler } from './modules/vm/helpers/planExpiryWarningScheduler';

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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Internal-Secret', 'x-tenant-id'],
    exposedHeaders: ['X-Request-ID'],
    maxAge: 86400,
  })
);

// Razorpay webhook — raw body required for HMAC verification (before JSON parser)
app.use('/webhooks/razorpay', express.raw({ type: 'application/json' }), razorpayWebhookRoutes);

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

// Health check
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'core-api' });
});

// Routes
app.use('/internal/tenants', internalTenantRoutes);
app.use('/api/v1/tenants', tenantRoutes);
app.use('/api/v1/tenant-branding', tenantBrandingRoutes);
app.use('/api/v1/tenant-auth', tenantAuthRoutes);
app.use('/api/v1/super-admin', superAdminRoutes);
app.use('/api/v1/super-admin/orders', superAdminOrderRoutes);
app.use('/api/v1/tenant-wallet', walletRoutes);
app.use('/api/v1/tenant-orders', orderRoutes);
app.use('/api/v1/tenant-plans', tenantPlanRoutes);
app.use('/api/v1/tenant-notifications', tenantNotificationRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/proxmox', proxmoxRoutes);
app.use('/api/v1/vms', vmRoutes);
app.use('/api/v1/external-vms', externalVmRoutes);
app.use('/api/v1/managed-users', managedUsersRoutes);
app.use('/api/v1/software', softwareRoutes);
app.use('/api/v1/vm-automations', vmAutomationRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/admin-vm-templates', adminVmTemplateRoutes);

// Start background services
startNodeMonitoring();
startHyperVSweeper();
startStorageReconcileSweeper();
startVmAutomationScheduler();
startPlanExpiryScheduler();
startPlanExpiryWarningScheduler();

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(globalErrorHandler);

export default app;
