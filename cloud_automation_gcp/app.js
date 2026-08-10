import 'dotenv/config';

import express from 'express';
import connectDB from './src/config/db.js';
import { validateGcpConfig } from './src/config/gcp.js';
import { ensureDefaultCatalog } from './src/services/catalogSeedService.js';
import healthRoutes from './src/routes/health.js';
import catalogRoutes from './src/routes/catalog.js';
import requestRoutes from './src/routes/requests.js';
import provisionRoutes from './src/routes/provision.routes.js';

const app = express();

app.use(express.json());

app.use('/health', healthRoutes);
app.use('/api', catalogRoutes);
app.use('/api', requestRoutes);
app.use('/api', provisionRoutes);

app.all('*', (req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message,
  });
});

const start = async () => {
  await connectDB();
  validateGcpConfig();
  await ensureDefaultCatalog();

  const port = Number(process.env.PORT || 3004);
  app.listen(port, () => {
    console.log(`Cloud Automation GCP running on port ${port}`);
  });
};

start();

export default app;
