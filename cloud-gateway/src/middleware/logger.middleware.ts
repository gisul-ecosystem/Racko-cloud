import morgan from 'morgan';
import type { Request } from 'express';
import { logger } from '../utils/logger';

/**
 * Morgan HTTP request logger.
 * Streams to Winston. Skips health check endpoint.
 */
export const loggerMiddleware = morgan('combined', {
  stream: {
    write: (message: string) => logger.info(message.trim()),
  },
  skip: (req) => (req as Request).path === '/health',
});
