/**
 * Script to permanently delete a VM Host Lease from the database
 * Deletes the row with all N/A values
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { config } from '../config';
import { VmHostLeaseModel } from '../modules/vmHostLeases/vmHostLease.model';

const MONGO_URI = config.MONGODB_URI || 'mongodb://localhost:27017/racko-cloud';

async function main() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    // Find and delete the row with all N/A values and dates "5 Aug 2026"
    const result = await VmHostLeaseModel.deleteMany({
      provider: 'N/A',
      ipAddress: 'N/A',
      description: 'N/A',
      assignedTo: 'N/A',
      vmUsername: 'N/A',
      vmPassword: 'N/A',
    });

    console.log(`✓ Permanently deleted ${result.deletedCount} row(s) with all N/A values`);

    await mongoose.disconnect();
    console.log('✓ Disconnected from MongoDB');
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
