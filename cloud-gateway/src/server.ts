import 'dotenv/config';
import http from 'http';
import httpProxy from 'http-proxy';
import app from './app';
import { config } from './config';
import { logger } from './utils/logger';

const server = http.createServer(app);

// Handle WebSocket upgrades for agent connections directly on the HTTP server.
// This avoids the res.status crash caused by ws:true in http-proxy-middleware.
const wsProxy = httpProxy.createProxyServer({
  target: config.CORE_API_URL,
  ws: true,
  changeOrigin: true,
});

wsProxy.on('error', (err) => {
  logger.error('[WS Proxy] WebSocket proxy error', { error: (err as Error).message });
});

server.on('upgrade', (req, socket, head) => {
  const url = req.url ?? '';
  if (url.startsWith('/api/v1/agent/connect')) {
    wsProxy.ws(req, socket, head);
  } else {
    socket.destroy();
  }
});

server.listen(config.PORT, () => {
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
