import('dotenv/config').then(async () => {
  const mongoose = await import('mongoose');
  await mongoose.default.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME });
  const db = mongoose.default.connection.db;
  const results = await db.collection('servicepricings').aggregate([
    { $group: { _id: '$serviceName', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]).toArray();
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
})
