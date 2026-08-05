import 'dotenv/config';
import express from 'express';
import connectDB from './src/config/db.js';
import healthRoutes from './src/routes/healthRoutes.js';
import labTemplateRoutes from './src/routes/labTemplateRoutes.js';
import enrollmentRoutes from './src/routes/enrollmentRoutes.js';

const app = express();

app.use(express.json());

app.use(healthRoutes);
app.use('/api/lab-templates', labTemplateRoutes);
app.use('/api/enrollments', enrollmentRoutes);

app.all('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.originalUrl}`,
  });
});

app.use((err, _req, res, _next) => {
  console.error('[error]', err.message);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message,
  });
});

const start = async () => {
  await connectDB();

  const port = Number(process.env.PORT || 3005);
  app.listen(port, () => {
    console.log(`Cloud Automation Training running on port ${port}`);
  });
};

start();

export default app;
