import('dotenv/config').then(async () => {
  const mongoose = await import('mongoose');
  await mongoose.default.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME });
  const db = mongoose.default.connection.db;
  const collections = await db.listCollections().toArray();
  console.log('DB name:', process.env.MONGODB_DB_NAME);
  console.log('Collections:', collections.map(c => c.name));
  const count = await db.collection('servicepricings').countDocuments();
  console.log('servicepricings count:', count);
  const count2 = await db.collection('services').countDocuments();
  console.log('services count:', count2);
  process.exit(0);
})
