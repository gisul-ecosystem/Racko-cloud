import 'dotenv/config';

import express from 'express';
import connectDB from './src/config/db.js';
import healthRoutes from './src/routes/health.js';
import apiRoutes from './src/routes/api.js';
import { startPricingSyncScheduler } from './src/schedulers/pricingSyncScheduler.js';

const app = express();

app.use(express.json({ limit: '1mb' }));

app.use('/health', healthRoutes);
app.use('/api', apiRoutes);

app.all('*', (_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

app.use((err, _req, res, _next) => {
  const statusCode = err.statusCode || 500;
  console.error('[error]', err.message);
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

const start = async () => {
  await connectDB();
  startPricingSyncScheduler();

  const port = Number(process.env.PORT || 3005);
  app.listen(port, () => {
    console.log(`Cloud Automation Reseller running on port ${port}`);
  });
};

start();

export default app;
