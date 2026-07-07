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
  defaultMeta: { service: 'cloud-gateway' },
  transports: [
    new winston.transports.Console({
      format: isDevelopment ? combine(colorize(), simple()) : combine(timestamp(), json()),
    }),
  ],
});
