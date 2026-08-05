import mongoose, { Document, Schema } from 'mongoose';

export type OrganizationAccessRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'more_info_required';

export type NdaStatus = 'not_started' | 'pending' | 'completed';

export interface IOrganizationAccessRequest extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  contactName: string;
  companyName: string;
  companyWebsite?: string;
  phone?: string;
  officeNumber?: string;
  designation?: string;
  companySize?: string;
  registeredAddress?: string;
  taxId?: string;
  useCase?: string;
  expectedUsage?: string;
  status: OrganizationAccessRequestStatus;
  ndaStatus: NdaStatus;
  reviewerNotes?: string;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const organizationAccessRequestSchema = new Schema<IOrganizationAccessRequest>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    contactName: { type: String, required: true, trim: true },
    companyName: { type: String, required: true, trim: true },
    companyWebsite: { type: String, trim: true },
    phone: { type: String, trim: true },
    officeNumber: { type: String, trim: true },
    designation: { type: String, trim: true },
    companySize: { type: String, trim: true },
    registeredAddress: { type: String, trim: true },
    taxId: { type: String, trim: true },
    useCase: { type: String, trim: true },
    expectedUsage: { type: String, trim: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'more_info_required'],
      default: 'pending',
      index: true,
    },
    ndaStatus: {
      type: String,
      enum: ['not_started', 'pending', 'completed'],
      default: 'not_started',
    },
    reviewerNotes: { type: String, trim: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
  },
  {
    timestamps: true,
    collection: 'organization_access_requests',
  }
);

organizationAccessRequestSchema.index({ status: 1, createdAt: -1 });

export const OrganizationAccessRequestModel = mongoose.model<IOrganizationAccessRequest>(
  'OrganizationAccessRequest',
  organizationAccessRequestSchema
);
