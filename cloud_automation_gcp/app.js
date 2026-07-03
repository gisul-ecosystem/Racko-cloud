import 'dotenv/config';
import express from 'express';
import connectDB from './src/config/db.js';
import { validateGcpConfig } from './src/config/gcp.js';
import healthRoutes from './src/routes/health.js';

const app = express();

app.use(express.json());

// Routes
app.use('/health', healthRoutes);

// 404 handler
app.all('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message,
  });
});

// Start
const start = async () => {
  await connectDB();
  validateGcpConfig();

  const port = Number(process.env.PORT || 3004);
  app.listen(port, () => {
    console.log(`Cloud Automation GCP running on port ${port}`);
  });
};

start();

export default app;
