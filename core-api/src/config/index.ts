import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  PORT: z.string().regex(/^\d+$/).transform(Number).default('8001'),

  // MongoDB
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_DB_NAME: z.string().min(1, 'MONGODB_DB_NAME is required'),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(64, 'JWT_ACCESS_SECRET must be at least 64 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(64, 'JWT_REFRESH_SECRET must be at least 64 characters'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Argon2id
  ARGON2_MEMORY_COST: z.string().regex(/^\d+$/).transform(Number).default('65536'),
  ARGON2_TIME_COST: z.string().regex(/^\d+$/).transform(Number).default('3'),
  ARGON2_PARALLELISM: z.string().regex(/^\d+$/).transform(Number).default('4'),

  // SendGrid
  SENDGRID_API_KEY: z.string().min(1, 'SENDGRID_API_KEY is required'),
  SENDGRID_FROM_EMAIL: z.string().email('SENDGRID_FROM_EMAIL must be a valid email'),
  SENDGRID_FROM_NAME: z.string().min(1, 'SENDGRID_FROM_NAME is required'),

  // Frontend
  FRONTEND_URL: z.string().url('FRONTEND_URL must be a valid URL'),

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
  VM_TASK_POLL_INTERVAL_MS: z.string().regex(/^\d+$/).transform(Number).default('2000'),
  VM_TASK_TIMEOUT_MS: z.string().regex(/^\d+$/).transform(Number).default('300000'),
  VM_MAX_BULK_COUNT: z.string().regex(/^\d+$/).transform(Number).default('100'),
  VM_CPU_OVERCOMMIT_RATIO: z.string().regex(/^\d+(\.\d+)?$/).transform(Number).default('4'),
  VM_RAM_OVERCOMMIT_RATIO: z.string().regex(/^\d+(\.\d+)?$/).transform(Number).default('1.5'),
  VM_DELETE_MAX_RETRIES: z.string().regex(/^\d+$/).transform(Number).default('3'),
  VM_DELETE_RETRY_BASE_DELAY_MS: z.string().regex(/^\d+$/).transform(Number).default('2000'),
  VM_POLL_NETWORK_RETRY_ATTEMPTS: z.string().regex(/^\d+$/).transform(Number).default('3'),
  VM_POLL_NETWORK_RETRY_DELAY_MS: z.string().regex(/^\d+$/).transform(Number).default('5000'),

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

  // Hyper-V / nested virtualization (Windows guests)
  HYPERV_AGENT_READY_TIMEOUT_MS: z.string().regex(/^\d+$/).transform(Number).default('300000'),
  HYPERV_EXEC_DEADLINE_MS: z.string().regex(/^\d+$/).transform(Number).default('1200000'),
  HYPERV_POST_REBOOT_SETTLE_MS: z.string().regex(/^\d+$/).transform(Number).default('20000'),
  HYPERV_EXEC_POLL_MS: z.string().regex(/^\d+$/).transform(Number).default('3000'),
  HYPERV_AGENT_POLL_MS: z.string().regex(/^\d+$/).transform(Number).default('5000'),
  HYPERV_MAX_CONCURRENT: z.string().regex(/^\d+$/).transform(Number).default('3'),
  HYPERV_SWEEPER_INTERVAL_MS: z.string().regex(/^\d+$/).transform(Number).default('120000'),
  HYPERV_STUCK_PENDING_MS: z.string().regex(/^\d+$/).transform(Number).default('300000'),
  HYPERV_STUCK_BUFFER_MS: z.string().regex(/^\d+$/).transform(Number).default('120000'),
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

  // Rate limiting
  RATE_LIMIT_GLOBAL_MAX: z.string().regex(/^\d+$/).transform(Number).default('2000'),

  // Guacamole (browser-based VM console)
  GUACAMOLE_BASE_URL: z.string().url('GUACAMOLE_BASE_URL must be a valid URL'),
  GUACAMOLE_PUBLIC_URL: z.string().url('GUACAMOLE_PUBLIC_URL must be a valid URL'),
  GUACAMOLE_USERNAME: z.string().min(1, 'GUACAMOLE_USERNAME is required'),
  GUACAMOLE_PASSWORD: z.string().min(1, 'GUACAMOLE_PASSWORD is required'),

  // Test VM scaffolding — remove once VM model stores private IP + credentials
  TEST_VM_IP: z.string().optional(),
  TEST_VM_USERNAME: z.string().optional(),
  TEST_VM_PASSWORD: z.string().optional(),
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
