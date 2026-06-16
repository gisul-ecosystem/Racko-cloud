import type { CorsOptions } from 'cors';
import { allowedOrigins, config } from './index';

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow no-origin in development (curl, server-to-server)
    if (!origin && config.NODE_ENV === 'development') return callback(null, true);
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Request-ID',
    'X-Access-Session',
    'X-Org-Admin-Session',
  ],
  exposedHeaders: ['X-Request-ID', 'Retry-After'],
  maxAge: 86400,
};
