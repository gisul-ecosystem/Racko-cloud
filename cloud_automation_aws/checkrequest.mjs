import('dotenv/config').then(async () => {
  const mongoose = await import('mongoose');
  await mongoose.default.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME });
  const db = mongoose.default.connection.db;
  const request = await db.collection('requests').findOne({ status: 'Completed' });
  console.log('Status:', request.status);
  console.log('AWS Account:', request.awsAccountId);
  console.log('Users:', JSON.stringify(request.identityUsers, null, 2));
  console.log('Permission Sets:', request.permissionSetArns);
  process.exit(0);
})
