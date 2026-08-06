/**
 * Migration script to update VM Host Leases collection schema
 * Converts old fields (vmIp, username, password, startDate, endDate)
 * to new fields (provider, ipAddress, description, invoiceDate, dueDate, assignedTo, vmUsername, vmPassword)
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { config } from '../config';
import { logger } from '../utils/logger';

const MONGO_URI = config.MONGODB_URI || 'mongodb://localhost:27017/racko-cloud';

async function main() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection failed');

    const collection = db.collection('vmhostleases');

    // Check if old fields exist
    const sample = await collection.findOne({});
    if (!sample) {
      console.log('Collection is empty, no migration needed.');
      await mongoose.disconnect();
      return;
    }

    console.log('Sample document fields:', Object.keys(sample));

    // Check if migration is needed
    const hasNewFields = sample.provider !== undefined && sample.ipAddress !== undefined;
    const hasOldFields = sample.vmIp !== undefined || sample.username !== undefined;

    if (hasNewFields) {
      console.log('✓ Collection already uses new schema, no migration needed.');
      await mongoose.disconnect();
      return;
    }

    if (!hasOldFields) {
      console.log('⚠ Collection has neither old nor new schema, migration not applicable.');
      await mongoose.disconnect();
      return;
    }

    // Perform migration
    console.log('Starting migration of old schema to new schema...');
    
    const result = await collection.updateMany(
      { vmIp: { $exists: true } },
      [
        {
          $set: {
            provider: { $ifNull: ['$provider', 'N/A'] },
            ipAddress: '$vmIp',
            description: { $ifNull: ['$description', 'Migrated lease'] },
            invoiceDate: { $cond: [{ $eq: ['$startDate', null] }, new Date(), '$startDate'] },
            dueDate: '$endDate',
            assignedTo: { $ifNull: ['$assignedTo', 'N/A'] },
            vmUsername: '$username',
            vmPassword: '$password',
          },
        },
      ]
    );

    // Remove old fields
    await collection.updateMany(
      { vmIp: { $exists: true } },
      {
        $unset: { vmIp: '', username: '', password: '', startDate: '', endDate: '' },
      }
    );

    console.log(`✓ Migration completed: ${result.modifiedCount} documents updated.`);

    await mongoose.disconnect();
    console.log('✓ Disconnected from MongoDB');
  } catch (err) {
    logger.error('Migration failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
