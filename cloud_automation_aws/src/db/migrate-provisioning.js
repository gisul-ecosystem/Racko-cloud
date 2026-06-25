import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from './config/db.js';
import Request from '../models/Request.js';

async function migrateRequests() {
  const result = await Request.updateMany(
    {
      $or: [
        { currentStep: { $exists: false } },
        { progress: { $exists: false } },
        { credentialsSent: { $exists: false } },
      ],
    },
    {
      $set: {
        currentStep: 0,
        progress: 0,
        credentialsSent: false,
        permissionSetArns: [],
        identityUsers: [],
      },
    }
  );

  console.log(`Migrated ${result.modifiedCount} request documents`);
}

async function main() {
  await connectDB();
  await migrateRequests();
  await mongoose.disconnect();
  console.log('Provisioning migration complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
