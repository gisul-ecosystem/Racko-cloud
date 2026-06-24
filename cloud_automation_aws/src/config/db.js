import mongoose from "mongoose";

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.MONGODB_DB_NAME,
      tls: true,
      tlsAllowInvalidCertificates: false,
    });
    console.log(`MongoDB connected — ${process.env.MONGODB_DB_NAME}`);
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  }
};

export default connectDB;