import dns from 'node:dns';
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
