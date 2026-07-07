import 'dotenv/config';
import app from './app';
import { config } from './config';
import { logger } from './utils/logger';

const server = app.listen(config.PORT, () => {
  logger.info(`cloud-gateway running on port ${config.PORT}`, {
    env: config.NODE_ENV,
    port: config.PORT,
  });
});

const shutdown = (signal: string): void => {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(() => {
    logger.info('Gateway server closed');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason });
  process.exit(1);
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception', { error: error.message });
  process.exit(1);
});
