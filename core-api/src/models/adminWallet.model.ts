import mongoose, { Document, Schema } from 'mongoose';

export interface IAdminWallet extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;   // super_admin user id
  balance: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

const adminWalletSchema = new Schema<IAdminWallet>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    balance: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      default: 'INR',
    },
  },
  { timestamps: true }
);

export const AdminWallet = mongoose.model<IAdminWallet>('AdminWallet', adminWalletSchema);
