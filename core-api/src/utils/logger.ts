import winston from 'winston';

const { combine, timestamp, json, errors, colorize, simple } = winston.format;

const isDevelopment = process.env['NODE_ENV'] === 'development';

export const logger = winston.createLogger({
  level: isDevelopment ? 'debug' : 'info',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    json()
  ),
  defaultMeta: { service: 'core-api' },
  transports: [
    new winston.transports.Console({
      format: isDevelopment ? combine(colorize(), simple()) : combine(timestamp(), json()),
    }),
  ],
});

// Never log sensitive fields
export function sanitizeForLog(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = ['password', 'token', 'secret', 'authorization', 'cookie', 'refreshToken'];
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveKeys.some((k) => key.toLowerCase().includes(k))) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
