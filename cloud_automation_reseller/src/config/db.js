import fs from 'fs';
import mongoose from 'mongoose';
import dns from 'dns';

// Prefer IPv4 — Node querySrv often fails on flaky IPv6 DNS (ECONNREFUSED).
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  /* older Node */
}

const connectDB = async () => {
  try {
    const useTls = process.env.MONGODB_TLS !== 'false';
    const tlsOptions = {};

    if (useTls) {
      tlsOptions.tls = true;
      tlsOptions.tlsAllowInvalidCertificates = false;

      const caFile = process.env.MONGODB_TLS_CA_FILE?.trim();
      if (caFile) {
        if (!fs.existsSync(caFile)) {
          throw new Error(`MONGODB_TLS_CA_FILE not found: ${caFile}`);
        }
        tlsOptions.tlsCAFile = caFile;
        console.log(`MongoDB TLS enabled with custom CA — ${caFile}`);
      }
    }

    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.MONGODB_DB_NAME || 'racko_reseller',
      serverSelectionTimeoutMS: 20_000,
      family: 4,
      ...tlsOptions,
    });
    console.log(`MongoDB connected — ${process.env.MONGODB_DB_NAME || 'racko_reseller'}`);

    // Drop legacy unique indexes so disk-type-aware rows can coexist cleanly.
    try {
      const col = mongoose.connection.collection('cloud_region_pricing');
      const indexes = await col.indexes();
      if (indexes.some((idx) => idx.name === 'provider_region_spec_unique')) {
        await col.dropIndex('provider_region_spec_unique');
        console.log('Dropped legacy index provider_region_spec_unique');
      }
      if (indexes.some((idx) => idx.name === 'provider_region_spec_mode_unique')) {
        await col.dropIndex('provider_region_spec_mode_unique');
        console.log('Dropped legacy index provider_region_spec_mode_unique');
      }
      const backfill = await col.updateMany(
        { diskType: { $exists: false } },
        { $set: { diskType: 'default' } }
      );
      if (backfill.modifiedCount > 0) {
        console.log(`Backfilled diskType=default on ${backfill.modifiedCount} pricing rows`);
      }
    } catch (idxErr) {
      console.warn(
        'Index migration skipped:',
        idxErr instanceof Error ? idxErr.message : idxErr
      );
    }
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  }
};

export default connectDB;
