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

  // Cloud automation GCP (GCP access management)
  CLOUD_AUTOMATION_GCP_URL: z
    .string()
    .url('CLOUD_AUTOMATION_GCP_URL must be a valid URL')
    .default('http://localhost:3004'),

  // Cloud automation training (Cloud Labs)
  CLOUD_AUTOMATION_TRAINING_URL: z
    .string()
    .url('CLOUD_AUTOMATION_TRAINING_URL must be a valid URL')
    .default('http://localhost:3005'),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(64, 'JWT_ACCESS_SECRET must be at least 64 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),

  // CORS
  ALLOWED_ORIGINS: z.string().min(1, 'ALLOWED_ORIGINS is required'),

  // Timeouts
  REQUEST_TIMEOUT_MS: z.string().regex(/^\d+$/).transform(Number).default('10000'),
  AWS_REQUEST_TIMEOUT_MS: z.string().regex(/^\d+$/).transform(Number).default('30000'),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.string().regex(/^\d+$/).transform(Number).default('900000'),
  RATE_LIMIT_LOGIN_FAILED_MAX: z.string().regex(/^\d+$/).transform(Number).default('50'),
  RATE_LIMIT_REGISTER_MAX: z.string().regex(/^\d+$/).transform(Number).default('10'),
  RATE_LIMIT_VERIFY_EMAIL_MAX: z.string().regex(/^\d+$/).transform(Number).default('10'),
  RATE_LIMIT_RESEND_VERIFICATION_MAX: z.string().regex(/^\d+$/).transform(Number).default('5'),
  RATE_LIMIT_USER_MAX: z.string().regex(/^\d+$/).transform(Number).default('5000'),

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

// Parse allowed origins into array
export const allowedOrigins = config.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
