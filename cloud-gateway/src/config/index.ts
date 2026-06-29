import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  PORT: z.string().regex(/^\d+$/).transform(Number).default('8000'),

  // Core API
  CORE_API_URL: z.string().url('CORE_API_URL must be a valid URL'),

  // Cloud automation (Azure access management)
  CLOUD_AUTOMATION_URL: z.string().url('CLOUD_AUTOMATION_URL must be a valid URL'),

  // Cloud automation AWS (AWS access management)
  CLOUD_AUTOMATION_AWS_URL: z
    .string()
    .url('CLOUD_AUTOMATION_AWS_URL must be a valid URL')
    .default('http://localhost:3003'),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(64, 'JWT_ACCESS_SECRET must be at least 64 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),

  // CORS (+ optional portal URLs merged into allowedOrigins below)
  ALLOWED_ORIGINS: z.string().min(1, 'ALLOWED_ORIGINS is required'),
  FRONTEND_URL: z.string().url().optional(),
  CLIENT_PORTAL_URL: z.string().url().optional(),

  // Timeouts
  REQUEST_TIMEOUT_MS: z.string().regex(/^\d+$/).transform(Number).default('10000'),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.string().regex(/^\d+$/).transform(Number).default('900000'),
  RATE_LIMIT_LOGIN_FAILED_MAX: z.string().regex(/^\d+$/).transform(Number).default('50'),
  RATE_LIMIT_REGISTER_MAX: z.string().regex(/^\d+$/).transform(Number).default('10'),
  RATE_LIMIT_VERIFY_EMAIL_MAX: z.string().regex(/^\d+$/).transform(Number).default('10'),
  RATE_LIMIT_USER_MAX: z.string().regex(/^\d+$/).transform(Number).default('500'),

  // Internal service secret
  INTERNAL_SERVICE_SECRET: z.string().min(64, 'INTERNAL_SERVICE_SECRET must be at least 64 characters'),
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

// Parse allowed origins; always include portal base URLs when set
const originSet = new Set(
  config.ALLOWED_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean)
);
if (config.FRONTEND_URL) originSet.add(config.FRONTEND_URL);
if (config.CLIENT_PORTAL_URL) originSet.add(config.CLIENT_PORTAL_URL);
export const allowedOrigins = [...originSet];
