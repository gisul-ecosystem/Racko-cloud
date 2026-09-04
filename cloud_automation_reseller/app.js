import 'dotenv/config';

import express from 'express';
import connectDB from './src/config/db.js';
import healthRoutes from './src/routes/health.js';
import apiRoutes from './src/routes/api.js';
import { startPricingSyncScheduler } from './src/schedulers/pricingSyncScheduler.js';
import { warmAzureVmSkuCache } from './src/provisioners/azure/azureCatalogLookup.js';
import { warmAzureMarketplaceBrowseCache } from './src/provisioners/azure/azureMarketplaceBrowse.js';

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
  warmAzureVmSkuCache().then((skus) => {
    if (Array.isArray(skus) && skus.length > 0) {
      console.log(`[azure] VM SKU cache ready (${skus.length} sizes)`);
    }
  });
  warmAzureMarketplaceBrowseCache().then((counts) => {
    if (counts.windows > 0 || counts.linux > 0) {
      console.log(
        `[azure] Marketplace browse cache ready (${counts.windows} Windows, ${counts.linux} Linux offers)`
      );
    }
  });

  const port = Number(process.env.PORT || 3005);
  const server = app.listen(port, () => {
    console.log(`Cloud Automation Reseller running on port ${port}`);
  });

  // /api/select live cloud fan-out can exceed Node's default 5m requestTimeout.
  server.requestTimeout = 0;
  server.headersTimeout = 0;
  server.timeout = 0;
};

start();

export default app;
