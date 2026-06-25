import mongoose from 'mongoose';

const usageWindowSchema = new mongoose.Schema(
  {
    day: {
      type: String,
      enum: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    },
    startTime: String,
    endTime: String,
  },
  { _id: false }
);

const selectedServiceSchema = new mongoose.Schema(
  {
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' },
    serviceName: String,
    instanceType: String,
    pricePerDay: Number,
  },
  { _id: false }
);

const permissionSchema = new mongoose.Schema(
  {
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' },
    serviceName: String,
    policies: [String],
  },
  { _id: false }
);

const identityUserSchema = new mongoose.Schema(
  {
    userIndex: Number,
    email: String,
    username: String,
    userId: String,
    temporaryPassword: String,
    needsActivation: { type: Boolean, default: false },
    awsAccountId: String,
    accountCreationRequestId: String,
    permissionSetArn: String,
    budgetExceeded: { type: Boolean, default: false },
    suspended: { type: Boolean, default: false },
    currentSpend: { type: Number, default: 0 },
  },
  { _id: false }
);

const provisionedAccountSchema = new mongoose.Schema(
  {
    userIndex: Number,
    awsAccountId: String,
    accountCreationRequestId: String,
    accountName: String,
    scpPolicyIds: [String],
    permissionSetArn: String,
  },
  { _id: false }
);

const assignmentSchema = new mongoose.Schema(
  {
    userId: String,
    username: String,
    permissionSetArn: String,
    assignmentId: String,
    status: String,
    targetAccountId: String,
  },
  { _id: false }
);

const provisionedResourcesSchema = new mongoose.Schema(
  {
    ou: String,
    scps: [String],
    assignments: [assignmentSchema],
    accounts: [provisionedAccountSchema],
    targetAccountId: String,
    scpSkipped: { type: Boolean, default: false },
    scpSkipReason: String,
  },
  { _id: false }
);

const requestSchema = new mongoose.Schema(
  {
    customerEmail: { type: String, required: true },
    requestName: String,
    accountCount: { type: Number, required: true, default: 10 },
    costingMode: { type: String, enum: ['shared', 'per_user'], default: 'shared' },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },

    enableDailyUsage: { type: Boolean, default: false },
    usageWindows: [usageWindowSchema],
    timezone: { type: String, default: 'Asia/Kolkata' },

    cleanupEnabled: { type: Boolean, default: false },
    cleanupIntervalHours: { type: Number },

    perUserBudgetUsd: { type: Number },

    selectedServices: [selectedServiceSchema],

    permissions: [permissionSchema],

    region: { type: String, required: true },

    estimatedPrice: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ['Pending', 'Provisioning', 'Completed', 'Failed', 'Expired'],
      default: 'Pending',
    },

    currentStep: { type: Number, default: 0 },
    progress: { type: Number, default: 0 },

    awsAccountId: String,
    awsAccountIds: [String],
    accountCreationRequestId: String,
    permissionSetArns: [String],
    identityUsers: [identityUserSchema],
    provisionedResources: { type: provisionedResourcesSchema, default: () => ({}) },

    credentialsSent: { type: Boolean, default: false },
    failureReason: String,

    createdBy: { type: String },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

export default mongoose.model('Request', requestSchema);
