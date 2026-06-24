import 'dotenv/config';

import express from 'express';
import connectDB from './src/config/db.js';
import healthRoutes from './src/routes/health.js';
import catalogRoutes from './src/routes/catalog.js';
import requestRoutes from './src/routes/requests.js';
import provisionRoutes from './src/routes/provision.routes.js';
import { ensureDefaultCatalog } from './src/services/catalogSeedService.js';
import { startCatalogScheduler } from './src/schedulers/catalogScheduler.js';
import { startBudgetScheduler } from './src/schedulers/budgetScheduler.js';
import { initializeIdentityCenter } from './src/config/ssoConfig.js';

const app = express();

app.use(express.json());

app.use('/health', healthRoutes);
app.use('/api', catalogRoutes);
app.use('/api', requestRoutes);
app.use('/api', provisionRoutes);

app.all('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

app.use((error, req, res, next) => {
  const statusCode = error.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    message: error.message
  });
});

await connectDB();
await ensureDefaultCatalog();
await initializeIdentityCenter();
startCatalogScheduler();
startBudgetScheduler();

const port = Number(process.env.PORT || 3003);

app.listen(port, () => {
  console.log(`Cloud Automation AWS running on port ${port}`);
});

export default app;
