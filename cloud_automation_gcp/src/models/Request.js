import mongoose from 'mongoose';

const usageWindowSchema = new mongoose.Schema(
  {
    dayOfWeek: { type: Number, min: 0, max: 6 },
    windowStartTime: String,
    windowEndTime: String,
    timezone: { type: String, default: 'Asia/Kolkata' },
    dailyLimitHours: { type: Number, default: null },
  },
  { _id: false }
);

const selectedServiceSchema = new mongoose.Schema(
  {
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'GcpService' },
    serviceName: String,
    instanceType: String,
    pricePerDay: Number,
    pricingType: { type: String, enum: ['instance', 'flat_rate'], default: 'instance' },
  },
  { _id: false }
);

const permissionSchema = new mongoose.Schema(
  {
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'GcpService' },
    serviceName: String,
    roles: [String],
  },
  { _id: false }
);

const provisionStepSchema = new mongoose.Schema(
  {
    status: { type: String, default: 'pending' },
    startedAt: Date,
    completedAt: Date,
    error: String,
    output: mongoose.Schema.Types.Mixed,
  },
  { _id: false }
);

const identityUserSchema = new mongoose.Schema(
  {
    userIndex: Number,
    username: String,
    email: String,
    userId: String,
    password: String,
    gcpProjectId: String,
    consoleUrl: String,
    suspended: { type: Boolean, default: false },
    budgetExceeded: { type: Boolean, default: false },
    currentSpend: { type: Number, default: 0 },
    roles: [String],
  },
  { _id: false }
);

const requestSchema = new mongoose.Schema(
  {
    customerEmail: { type: String, required: true },
    projectName: String,
    requestName: String,
    projectId: { type: String, default: null, index: true },
    idMode: { type: String, enum: ['test_ids', 'gcp_ids'], default: 'gcp_ids' },
    accountCount: { type: Number, required: true, min: 1, default: 10 },
    costingMode: { type: String, enum: ['shared', 'per_user'], default: 'shared' },
    accessType: {
      type: String,
      enum: ['magic_link', 'cloud_identity'],
      default: 'cloud_identity',
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    region: { type: String, required: true },

    enableDailyUsage: { type: Boolean, default: false },
    usageWindows: [usageWindowSchema],
    timezone: { type: String, default: 'Asia/Kolkata' },

    enableResourceCleanup: { type: Boolean, default: false },
    resourceCleanupIntervalHours: { type: Number, min: 1, max: 24 },
    resourceCleanupTime: String,
    resourceCleanupTimezone: { type: String, default: 'Asia/Kolkata' },
    resourceCleanupAction: { type: String, enum: ['delete', 'pause'], default: 'delete' },
    resourceCleanupNextRunAt: Date,
    resourceCleanupLastRanAt: Date,

    cleanupEnabled: { type: Boolean, default: false },
    cleanupIntervalHours: { type: Number },
    cleanupNextRunAt: Date,
    cleanupCompleted: { type: Boolean, default: false },

    perUserBudgetUsd: { type: Number, default: null },

    selectedServices: [selectedServiceSchema],
    permissions: [permissionSchema],
    selectedPermissions: {
      type: Map,
      of: [String],
      default: undefined,
    },

    estimatedPrice: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ['Pending', 'Provisioning', 'Completed', 'Failed', 'Expired'],
      default: 'Pending',
    },

    provisionStatus: {
      overall: {
        type: String,
        enum: ['idle', 'running', 'completed', 'failed'],
        default: 'idle',
      },
      steps: {
        create_project: { type: provisionStepSchema, default: () => ({}) },
        apply_org_policy: { type: provisionStepSchema, default: () => ({}) },
        create_users: { type: provisionStepSchema, default: () => ({}) },
        assign_iam: { type: provisionStepSchema, default: () => ({}) },
        send_credentials: { type: provisionStepSchema, default: () => ({}) },
      },
    },

    currentStep: { type: Number, default: 0 },
    progress: { type: Number, default: 0 },

    gcpProjectId: String,
    gcpProjectIds: [String],
    identityUsers: [identityUserSchema],

    credentialsSent: { type: Boolean, default: false },
    failureReason: String,

    createdBy: { type: String },
    portalBaseUrl: { type: String },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

export default mongoose.model('GcpRequest', requestSchema, 'gcp_requests');
