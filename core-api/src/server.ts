import 'dotenv/config';
import app from './app';
import { config } from './config';
import { connectDatabase } from './config/database';
import { logger } from './utils/logger';
import { startIpCleanupCron } from './modules/vm/ipAllocator.service';

async function bootstrap(): Promise<void> {
  // Connect to MongoDB
  await connectDatabase();

  // Start background cron to reclaim stale IP reservations
  startIpCleanupCron();

  const server = app.listen(config.PORT, () => {
    logger.info(`core-api running on port ${config.PORT}`, {
      env: config.NODE_ENV,
      port: config.PORT,
    });
  });

  // Attach WebSocket server for agent connections
  const { wsManager } = await import('./modules/machine-manager/websocket/wsManager');
  wsManager.attach(server);

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      const { disconnectDatabase } = await import('./config/database');
      await disconnectDatabase();
      logger.info('Server closed');
      process.exit(0);
    });

    // Force exit after 10s
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason });
    // Do not exit — transient DB/network rejections should not crash the process.
    // Mongoose will auto-reconnect; the app stays alive to serve requests.
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message });
    process.exit(1);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
