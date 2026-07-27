import('dotenv/config').then(async () => {
  const mongoose = await import('mongoose');
  await mongoose.default.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME });
  console.log('MongoDB connected');
  const { syncAWSCatalog } = await import('./src/services/catalogSyncService.js');
  const result = await syncAWSCatalog();
  console.log('Sync result:', JSON.stringify(result, null, 2));
  process.exit(0);
})
