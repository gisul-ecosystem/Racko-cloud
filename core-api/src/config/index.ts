import { z } from 'zod';
 
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  PORT: z.string().regex(/^\d+$/).transform(Number).default('8001'),

  // MongoDB
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_DB_NAME: z.string().min(1, 'MONGODB_DB_NAME is required'),
  MONGODB_DNS_SERVERS: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(',')
            .map((server) => server.trim())
            .filter(Boolean)
        : undefined
    ),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(64, 'JWT_ACCESS_SECRET must be at least 64 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_TENANT_ACCESS_EXPIRES_IN: z.string().default('1d'),
  JWT_REFRESH_SECRET: z.string().min(64, 'JWT_REFRESH_SECRET must be at least 64 characters'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Argon2id
  ARGON2_MEMORY_COST: z.string().regex(/^\d+$/).transform(Number).default('65536'),
  ARGON2_TIME_COST: z.string().regex(/^\d+$/).transform(Number).default('3'),
  ARGON2_PARALLELISM: z.string().regex(/^\d+$/).transform(Number).default('4'),

  // Email (Resend)
  RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY is required'),
  EMAIL_FROM_ADDRESS: z.string().email('EMAIL_FROM_ADDRESS must be a valid email'),
  EMAIL_FROM_NAME: z.string().min(1, 'EMAIL_FROM_NAME is required'),

  // Frontend
  FRONTEND_URL: z.string().url('FRONTEND_URL must be a valid URL'),
  /** Comma-separated browser origins (tenant domains). Defaults to FRONTEND_URL only. */
  ALLOWED_ORIGINS: z.string().optional(),

  // Gateway / API base
  GATEWAY_URL: z.string().url('GATEWAY_URL must be a valid URL').optional().default('http://localhost:8000'),
  API_URL: z.string().url('API_URL must be a valid URL').optional(),

  // Account lockout
  MAX_LOGIN_ATTEMPTS: z.string().regex(/^\d+$/).transform(Number).default('5'),
  LOCK_DURATION_MINUTES: z.string().regex(/^\d+$/).transform(Number).default('30'),

  // Email verification
  EMAIL_VERIFICATION_EXPIRES_HOURS: z.string().regex(/^\d+$/).transform(Number).default('24'),

  // Super admin seed
  SUPER_ADMIN_EMAIL: z.string().email('SUPER_ADMIN_EMAIL must be a valid email'),
  SUPER_ADMIN_PASSWORD: z.string().min(16, 'SUPER_ADMIN_PASSWORD must be at least 16 characters'),

  // Internal service secret
  INTERNAL_SERVICE_SECRET: z.string().min(64, 'INTERNAL_SERVICE_SECRET must be at least 64 characters'),

  // Proxmox
  PROXMOX_HOST: z.string().url('PROXMOX_HOST must be a valid URL'),
  PROXMOX_TOKEN_ID: z.string().min(1, 'PROXMOX_TOKEN_ID is required'),
  PROXMOX_TOKEN_SECRET: z.string().min(1, 'PROXMOX_TOKEN_SECRET is required'),
  PROXMOX_VERIFY_SSL: z.string().transform((val) => val === 'true').default('false'),
  PROXMOX_REQUEST_TIMEOUT_MS: z.string().regex(/^\d+$/).transform(Number).default('30000'),

  // VM Configuration
  VM_BULK_BATCH_SIZE: z.string().regex(/^\d+$/).transform(Number).default('10'),
  VM_CLONE_BATCH_SIZE: z.string().regex(/^\d+$/).transform(Number).default('3'),
  VM_BULK_DELETE_BATCH_SIZE: z.string().regex(/^\d+$/).transform(Number).default('5'),
  VM_TASK_POLL_INTERVAL_MS: z.string().regex(/^\d+$/).transform(Number).default('2000'),
  VM_TASK_TIMEOUT_MS: z.string().regex(/^\d+$/).transform(Number).default('300000'),
  VM_MAX_BULK_COUNT: z.string().regex(/^\d+$/).transform(Number).default('100'),
  VM_CPU_OVERCOMMIT_RATIO: z.string().regex(/^\d+(\.\d+)?$/).transform(Number).default('4'),
  VM_RAM_OVERCOMMIT_RATIO: z.string().regex(/^\d+(\.\d+)?$/).transform(Number).default('1.5'),
  VM_DELETE_MAX_RETRIES: z.string().regex(/^\d+$/).transform(Number).default('3'),
  VM_DELETE_RETRY_BASE_DELAY_MS: z.string().regex(/^\d+$/).transform(Number).default('2000'),
  // Max concurrent qmdestroy operations per Proxmox node (0 = unlimited)
  VM_DELETE_MAX_CONCURRENT_PER_NODE: z.string().regex(/^\d+$/).transform(Number).default('2'),
  // Orphan cloudinit LV reconciliation (storage sweeper)
  VM_STORAGE_RECONCILE_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  VM_STORAGE_RECONCILE_INTERVAL_MS: z.string().regex(/^\d+$/).transform(Number).default('3600000'),
  VM_STORAGE_RECONCILE_DRY_RUN: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  VM_POLL_NETWORK_RETRY_ATTEMPTS: z.string().regex(/^\d+$/).transform(Number).default('3'),
  VM_POLL_NETWORK_RETRY_DELAY_MS: z.string().regex(/^\d+$/).transform(Number).default('5000'),
  // Retry clone when Proxmox returns "no worker upid" (transient worker exhaustion)
  VM_CLONE_WORKER_RETRY_ATTEMPTS: z.string().regex(/^\d+$/).transform(Number).default('3'),
  VM_CLONE_WORKER_RETRY_DELAY_MS: z.string().regex(/^\d+$/).transform(Number).default('15000'),

  // Resource Alert Thresholds
  ALERT_CPU_WARNING: z.string().regex(/^\d+$/).transform(Number).default('70'),
  ALERT_CPU_CRITICAL: z.string().regex(/^\d+$/).transform(Number).default('85'),
  ALERT_CPU_FULL: z.string().regex(/^\d+$/).transform(Number).default('95'),
  ALERT_RAM_WARNING: z.string().regex(/^\d+$/).transform(Number).default('70'),
  ALERT_RAM_CRITICAL: z.string().regex(/^\d+$/).transform(Number).default('85'),
  ALERT_RAM_FULL: z.string().regex(/^\d+$/).transform(Number).default('95'),
  ALERT_STORAGE_WARNING: z.string().regex(/^\d+$/).transform(Number).default('70'),
  ALERT_STORAGE_CRITICAL: z.string().regex(/^\d+$/).transform(Number).default('85'),
  ALERT_STORAGE_FULL: z.string().regex(/^\d+$/).transform(Number).default('95'),

  // Monitoring
  NODE_MONITOR_INTERVAL_MS: z.string().regex(/^\d+$/).transform(Number).default('60000'),

  // VM automation scheduler (hibernate / resume)
  VM_AUTOMATION_TICK_INTERVAL_MS: z.string().regex(/^\d+$/).transform(Number).default('60000'),
  VM_AUTOMATION_STAGGER_MS: z.string().regex(/^\d+$/).transform(Number).default('300'),

  // Tenant VM plan expiry (graceful stop when planPeriodEnd passes)
  PLAN_EXPIRY_CHECK_INTERVAL_MS: z.string().regex(/^\d+$/).transform(Number).default('300000'),
  PLAN_EXPIRY_WARNING_DAYS: z.string().regex(/^\d+$/).transform(Number).default('7'),
  PLAN_EXPIRY_WARNING_CHECK_INTERVAL_MS: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('3600000'),

  // Software installation (Windows guests — Chocolatey)
  SOFTWARE_QMP_RETRY_DELAY_MS: z.string().regex(/^\d+$/).transform(Number).default('45000'),
  SOFTWARE_VM_START_TIMEOUT_MS: z.string().regex(/^\d+$/).transform(Number).default('300000'),
  SYSPREP_SHUTDOWN_TIMEOUT_MS: z.string().regex(/^\d+$/).transform(Number).default('600000'),

  // Hyper-V / nested virtualization (Windows guests)
  HYPERV_AGENT_READY_TIMEOUT_MS: z.string().regex(/^\d+$/).transform(Number).default('300000'),
  HYPERV_EXEC_DEADLINE_MS: z.string().regex(/^\d+$/).transform(Number).default('1200000'),
  HYPERV_POST_REBOOT_SETTLE_MS: z.string().regex(/^\d+$/).transform(Number).default('20000'),
  HYPERV_EXEC_POLL_MS: z.string().regex(/^\d+$/).transform(Number).default('3000'),
  HYPERV_AGENT_POLL_MS: z.string().regex(/^\d+$/).transform(Number).default('5000'),
  HYPERV_MAX_CONCURRENT: z.string().regex(/^\d+$/).transform(Number).default('3'),
  HYPERV_SWEEPER_INTERVAL_MS: z.string().regex(/^\d+$/).transform(Number).default('120000'),
  HYPERV_STUCK_PENDING_MS: z.string().regex(/^\d+$/).transform(Number).default('300000'),
  HYPERV_STUCK_INPROGRESS_MS: z.string().regex(/^\d+$/).transform(Number).default('300000'),
  HYPERV_MAX_SWEEPER_ATTEMPTS: z.string().regex(/^\d+$/).transform(Number).default('3'),
  // Per-VM lease lock: a live provisioner renews `hyperVLockedUntil` on a
  // heartbeat; a crashed one lets the lease expire so the sweeper can recover.
  HYPERV_LOCK_LEASE_MS: z.string().regex(/^\d+$/).transform(Number).default('90000'),
  HYPERV_LOCK_HEARTBEAT_MS: z.string().regex(/^\d+$/).transform(Number).default('30000'),
  // Enable a second reboot after the Hyper-V feature install. Some Windows
  // builds stage the hypervisor on the first boot and only load it on the next.
  HYPERV_SECOND_REBOOT: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  // Guacamole (browser-based VM console)
  GUACAMOLE_BASE_URL: z.string().url('GUACAMOLE_BASE_URL must be a valid URL'),
  GUACAMOLE_PUBLIC_URL: z.string().url('GUACAMOLE_PUBLIC_URL must be a valid URL'),
  GUACAMOLE_USERNAME: z.string().min(1, 'GUACAMOLE_USERNAME is required'),
  GUACAMOLE_PASSWORD: z.string().min(1, 'GUACAMOLE_PASSWORD is required'),

  // Razorpay (wallet top-up)
  RAZORPAY_KEY_ID: z.string().optional().default(''),
  RAZORPAY_KEY_SECRET: z.string().optional().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(''),

  // Manual wallet top-up (super-admin offline payments)
  MANUAL_TOPUP_MAX_AMOUNT: z
    .string()
    .regex(/^\d+(\.\d+)?$/)
    .optional()
    .default('500000')
    .transform(Number),

  // Tenant branding asset volume (logo, favicon, login page image cache)
  TENANT_ASSETS_VOLUME_PATH: z.string().default('./data/tenant-assets'),

  // Test VM scaffolding — remove once VM model stores private IP + credentials
  TEST_VM_IP: z.string().optional(),
  TEST_VM_USERNAME: z.string().optional(),
  TEST_VM_PASSWORD: z.string().optional(),

  // Create VM catalog agent (Webyne Playwright) — used by approve → fulfill
  CREATE_VM_AGENT_URL: z
    .string()
    .url()
    .optional()
    .default('http://127.0.0.1:3789'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  parsed.error.issues.forEach((issue) => {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  });
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;

export const allowedOrigins = (config.ALLOWED_ORIGINS ?? config.FRONTEND_URL)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
