import dns from 'node:dns';
import fs from 'node:fs';
import mongoose from 'mongoose';
import { config } from './index';
import { logger } from '../utils/logger';

if (config.MONGODB_DNS_SERVERS?.length) {
  dns.setServers(config.MONGODB_DNS_SERVERS);
  logger.info('Using custom MongoDB DNS servers', { servers: config.MONGODB_DNS_SERVERS });
}

const MONGODB_OPTIONS: mongoose.ConnectOptions = {
  dbName: config.MONGODB_DB_NAME,
  maxPoolSize: 10,
  minPoolSize: 2,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
  heartbeatFrequencyMS: 10000,
};

if (config.MONGODB_TLS_CA_FILE) {
  if (!fs.existsSync(config.MONGODB_TLS_CA_FILE)) {
    logger.error('MONGODB_TLS_CA_FILE not found', { path: config.MONGODB_TLS_CA_FILE });
    process.exit(1);
  }
  MONGODB_OPTIONS.tls = true;
  MONGODB_OPTIONS.tlsCAFile = config.MONGODB_TLS_CA_FILE;
  // Prefer validating with the provided CA (do not use tlsAllowInvalidCertificates).
  logger.info('MongoDB TLS enabled with custom CA', { caFile: config.MONGODB_TLS_CA_FILE });
}

export async function connectDatabase(): Promise<void> {
  try {
    mongoose.set('strictQuery', true);

    mongoose.connection.on('connected', () => {
      logger.info('MongoDB connection established');
    });

    mongoose.connection.on('error', (err: Error) => {
      logger.error('MongoDB connection error', { error: err.message });
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB connection lost');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });

    await mongoose.connect(config.MONGODB_URI, MONGODB_OPTIONS);

    // One-time repair: drop the stale orgId_1_year_1_sequenceNumber_1 index on the
    // projects collection if it was created without the partial filter expression.
    // Without the filter, it incorrectly enforces uniqueness on orgId:null (tenant projects),
    // causing E11000 duplicate key errors. Mongoose will recreate it correctly on next sync.
    try {
      const db = mongoose.connection.db;
      if (db) {
        const indexes = await db.collection('projects').indexes();
        const staleIndex = indexes.find(
          (idx) =>
            idx.name === 'orgId_1_year_1_sequenceNumber_1' &&
            !idx.partialFilterExpression
        );
        if (staleIndex) {
          await db.collection('projects').dropIndex('orgId_1_year_1_sequenceNumber_1');
          logger.info('[Migration] Dropped stale projects index orgId_1_year_1_sequenceNumber_1 (missing partial filter). Mongoose will recreate it correctly.');
        }
      }
    } catch (indexErr) {
      // Non-fatal — log and continue. Mongoose will attempt to create correct index anyway.
      logger.warn('[Migration] Could not repair projects index', {
        error: indexErr instanceof Error ? indexErr.message : String(indexErr),
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to connect to MongoDB', { error: message });
    process.exit(1);
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  logger.info('MongoDB connection closed');
}
