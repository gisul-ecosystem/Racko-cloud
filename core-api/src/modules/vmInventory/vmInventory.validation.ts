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
      emailPrefix: z.string().email('emailPrefix must be a valid email address').max(200).trim(),
      passwordMode: z.enum(['auto', 'shared']),
      sharedPassword: seriesPassword.optional(),
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
    }),
});

export const bulkDeleteServersSchema = z.object({
  body: z.object({
    serverIds: z.array(mongoObjectId).min(1).max(500),
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
