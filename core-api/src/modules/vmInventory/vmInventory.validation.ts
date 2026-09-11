import { z } from 'zod';
import mongoose from 'mongoose';

const mongoObjectId = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), { message: 'Invalid ID format' });

const inventorySource = z.enum(['inventory', 'platform_vm', 'catalog_vm', 'dedicated_server']);
const vmType = z.enum(['rdp', 'ssh', 'vnc']);
const planDuration = z.enum(['hourly', 'monthly', 'quarterly', 'yearly']);
const assigneeType = z.enum(['platform_user', 'tenant_user']);

const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((v) => v === true || v === 'true');

export const listVmInventorySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(200).optional(),
    search: z.string().max(200).trim().optional(),
    source: inventorySource.optional(),
    projectId: mongoObjectId.optional(),
    adminId: mongoObjectId.optional(),
    tenantId: mongoObjectId.optional(),
    clientName: z.string().max(200).trim().optional(),
    assigneeId: mongoObjectId.optional(),
    vmSpec: z.string().max(200).trim().optional(),
    assigned: z.enum(['assigned', 'unassigned']).optional(),
    locked: booleanish.optional(),
  }),
});

export const serverIdParamSchema = z.object({
  params: z.object({ serverId: mongoObjectId }),
});

const scheduleWindow = z.object({
  start: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be HH:MM (24h)'),
  end: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be HH:MM (24h)'),
});

const accessScheduleInput = z.object({
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
  weeklySchedule: z
    .array(
      z.object({
        day: z.string(),
        enabled: z.boolean(),
        windows: z.array(scheduleWindow),
      })
    )
    .nullable()
    .optional(),
});

/** Mirrors the platform bulk-assign rules so operators see one password policy. */
const seriesPassword = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password too long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const bulkAssignSchema = z.object({
  body: z
    .object({
      credentialIds: z.array(mongoObjectId).min(1).max(250),
      targetType: z.enum(['admin', 'tenant']),
      targetId: mongoObjectId,
      projectId: mongoObjectId,
      /** Base address for the numbered series. Omit when `emails` is supplied. */
      emailPrefix: z
        .string()
        .email('emailPrefix must be a valid email address')
        .max(200)
        .trim()
        .optional(),
      /** Exact addresses, one per credential, instead of a generated series. */
      emails: z
        .array(z.string().email('Each email must be a valid email address').max(200).trim())
        .min(1)
        .max(250)
        .optional(),
      passwordMode: z.enum(['auto', 'shared', 'per_row']),
      sharedPassword: seriesPassword.optional(),
      /**
       * One password per credential, from an uploaded file. Kept loose here so
       * a single weak entry fails its own row with a readable reason instead of
       * rejecting the whole upload.
       */
      passwords: z.array(z.string().min(1).max(128)).min(1).max(250).optional(),
      accessSchedule: accessScheduleInput.nullable().optional(),
      dryRun: z.boolean().default(true),
    })
    .superRefine((data, ctx) => {
      if (data.passwordMode === 'shared' && !data.sharedPassword) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'sharedPassword is required when passwordMode is "shared".',
          path: ['sharedPassword'],
        });
      }
      if (!data.emails && !data.emailPrefix) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Provide either emailPrefix or emails.',
          path: ['emailPrefix'],
        });
      }
      if (data.emails && data.emails.length !== data.credentialIds.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'emails must have exactly one address per selected login.',
          path: ['emails'],
        });
      }
      if (data.passwordMode === 'per_row' && !data.passwords) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'passwords is required when passwordMode is "per_row".',
          path: ['passwords'],
        });
      }
      if (data.passwords && data.passwords.length !== data.credentialIds.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'passwords must have exactly one entry per selected login.',
          path: ['passwords'],
        });
      }
    }),
});

/** Matches uploaded IP + username pairs against the inventory before assigning. */
export const resolveLoginsSchema = z.object({
  body: z.object({
    rows: z
      .array(
        z.object({
          ipAddress: z.string().min(1).max(64).trim(),
          username: z.string().min(1).max(100).trim(),
          /** Compared against the stored password; never written. */
          vmPassword: z.string().max(500).nullable().optional(),
        })
      )
      .min(1)
      .max(250),
  }),
});

export const bulkDeleteServersSchema = z.object({
  body: z.object({
    serverIds: z.array(mongoObjectId).min(1).max(500),
  }),
});

export const bulkResetServersSchema = z.object({
  body: z.object({
    serverIds: z.array(mongoObjectId).min(1).max(100),
  }),
});

export const bulkUnassignServersSchema = z.object({
  body: z.object({
    serverIds: z.array(mongoObjectId).min(1).max(500),
  }),
});

export const pushAgentSchema = z.object({
  body: z.object({
    serverIds: z.array(mongoObjectId).min(1).max(50),
    /** The racko-app GUI bundle is ~72MB, so it is opt-out for lab batches. */
    installRackoApp: z.boolean().default(true),
  }),
});

export const updateNotificationSettingsSchema = z.object({
  body: z.object({
    providerExpiryRecipients: z
      .array(z.string().trim().toLowerCase().email('Enter a valid email address.').max(200))
      .max(20),
    /** 0 = on the expiry day, 1 = one day before, up to 30. */
    warningDays: z.number().int().min(0).max(30).optional(),
  }),
});

export const installSoftwareSchema = z.object({
  body: z.object({
    credentialIds: z.array(mongoObjectId).min(1).max(250),
    softwareIds: z.array(mongoObjectId).min(1).max(20),
    /**
     * What the assign flow knows and the endpoint otherwise wouldn't, saved on
     * the run so the tracking view can say who the install was for. Optional
     * throughout: a bare install still records a usable run.
     */
    context: z
      .object({
        targetType: z.enum(['admin', 'tenant']).optional(),
        targetId: mongoObjectId.optional(),
        projectId: mongoObjectId.optional(),
        assignedCount: z.number().int().min(0).optional(),
        assigned: z
          .array(
            z.object({
              ipAddress: z.string().trim().min(1).max(100),
              email: z.string().trim().email().max(320),
            })
          )
          .max(250)
          .optional(),
        resetSummary: z.string().trim().max(500).optional(),
      })
      .optional(),
  }),
});

export const installRunIdParamSchema = z.object({
  params: z.object({ runId: mongoObjectId }),
});

export const listInstallRunsSchema = z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(50).optional(),
  }),
});

export const bulkSetOverrideSchema = z.object({
  body: z.object({
    serverIds: z.array(mongoObjectId).min(1).max(500),
    accessOverride: z.boolean(),
    accessOverrideUntil: z.coerce.date().nullable().optional(),
  }),
});

export const credentialIdParamSchema = z.object({
  params: z.object({ credentialId: mongoObjectId }),
});

export const assignmentIdParamSchema = z.object({
  params: z.object({ assignmentId: mongoObjectId }),
});

export const updateServerSchema = z.object({
  params: z.object({ serverId: mongoObjectId }),
  body: z
    .object({
      vmType: vmType.optional(),
      vmSpec: z.string().max(200).trim().nullable().optional(),
      planDuration: planDuration.nullable().optional(),
      provider: z.string().max(200).trim().nullable().optional(),
      providerStartDate: z.coerce.date().nullable().optional(),
      providerEndDate: z.coerce.date().nullable().optional(),
      notes: z.string().max(1000).trim().nullable().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, { message: 'No fields to update.' }),
});

export const upsertCredentialSchema = z.object({
  params: z.object({ serverId: mongoObjectId }),
  body: z.object({
    credentialId: mongoObjectId.optional(),
    username: z.string().min(1).max(100).trim(),
    password: z.string().min(1).max(500).optional(),
  }),
});

export const setLockSchema = z.object({
  params: z.object({ serverId: mongoObjectId }),
  body: z.object({ inventoryLocked: z.boolean() }),
});

export const assignCredentialSchema = z.object({
  body: z.object({
    credentialId: mongoObjectId,
    assigneeType,
    assigneeId: mongoObjectId,
    projectId: mongoObjectId,
  }),
});

export const setOverrideSchema = z.object({
  params: z.object({ assignmentId: mongoObjectId }),
  body: z.object({
    accessOverride: z.boolean(),
    accessOverrideUntil: z.coerce.date().nullable().optional(),
  }),
});

export const mapOwnerSchema = z.object({
  body: z
    .object({
      source: inventorySource,
      sourceId: mongoObjectId,
      adminId: mongoObjectId.nullable().optional(),
      tenantId: mongoObjectId.nullable().optional(),
    })
    .refine((b) => !(b.adminId && b.tenantId), {
      message: 'Provide either adminId or tenantId, not both.',
    }),
});

export const ownerQuerySchema = z.object({
  query: z
    .object({
      adminId: mongoObjectId.optional(),
      tenantId: mongoObjectId.optional(),
    })
    .refine((q) => Boolean(q.adminId) || Boolean(q.tenantId), {
      message: 'Provide adminId or tenantId.',
    }),
});

export const importRowsSchema = z.object({
  body: z.object({
    dryRun: z.boolean().default(true),
    rows: z
      .array(
        z.object({
          ipAddress: z.string().min(1).max(64).trim(),
          vmType: z.string().max(20).trim().nullable().optional(),
          vmSpec: z.string().max(200).trim().nullable().optional(),
          planDuration: z.string().max(20).trim().nullable().optional(),
          provider: z.string().max(200).trim().nullable().optional(),
          username: z.string().max(100).trim().nullable().optional(),
          password: z.string().max(500).nullable().optional(),
          providerStartDate: z.coerce.date().nullable().optional(),
          providerEndDate: z.coerce.date().nullable().optional(),
        })
      )
      .min(1)
      .max(2000),
  }),
});

export type ListVmInventoryInput = z.infer<typeof listVmInventorySchema>;
export type UpdateServerInput = z.infer<typeof updateServerSchema>;
export type ImportRowsInput = z.infer<typeof importRowsSchema>;
