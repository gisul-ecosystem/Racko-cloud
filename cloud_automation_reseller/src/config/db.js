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

    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.MONGODB_DB_NAME || 'racko_reseller',
      serverSelectionTimeoutMS: 20_000,
      family: 4,
      ...(useTls && {
        tls: true,
        tlsAllowInvalidCertificates: false,
      }),
    });
    console.log(`MongoDB connected — ${process.env.MONGODB_DB_NAME || 'racko_reseller'}`);
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  }
};

export default connectDB;
