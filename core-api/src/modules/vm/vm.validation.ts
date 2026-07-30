import { z } from 'zod';
import mongoose from 'mongoose';

// ─── Reusable validators ──────────────────────────────────────────────────────

const mongoObjectId = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), {
    message: 'Invalid ID format',
  });

// ─── Create VM ────────────────────────────────────────────────────────────────

export const createVMSchema = z.object({
  body: z.object({
    templateId: z
      .number({ required_error: 'templateId is required' })
      .int('templateId must be an integer')
      .positive('templateId must be positive'),
    name: z
      .string({ required_error: 'name is required' })
      .min(3, 'Name must be at least 3 characters')
      .max(50, 'Name must be at most 50 characters')
      .regex(/^[a-zA-Z0-9-]+$/, 'Only alphanumeric characters and hyphens allowed')
      .transform((val) => val.toLowerCase()),
    count: z
      .number({ required_error: 'count is required' })
      .int('count must be an integer')
      .min(1, 'count must be at least 1')
      .max(100, 'count cannot exceed 100'),
    cloneType: z.enum(['dedicated_storage', 'dynamic_storage'], {
      required_error: 'cloneType is required',
      invalid_type_error: 'cloneType must be dedicated_storage or dynamic_storage',
    }),
    cpuCores: z
      .number()
      .int('cpuCores must be an integer')
      .min(1, 'cpuCores must be at least 1')
      .max(128, 'cpuCores cannot exceed 128')
      .optional(),
    memoryGb: z
      .number()
      .min(0.5, 'memoryGb must be at least 0.5')
      .max(512, 'memoryGb cannot exceed 512')
      .optional(),
    diskGb: z
      .number()
      .int('diskGb must be an integer')
      .min(10, 'diskGb must be at least 10')
      .max(10000, 'diskGb cannot exceed 10000')
      .optional(),
    description: z
      .string()
      .max(500, 'description cannot exceed 500 characters')
      .optional(),
    passwordMode: z.enum(['fixed', 'dynamic'], {
      required_error: 'passwordMode is required',
      invalid_type_error: 'passwordMode must be fixed or dynamic',
    }),
    consolePassword: z
      .string()
      .min(1, 'Console password is required')
      .max(256, 'Console password cannot exceed 256 characters')
      .optional(),
    enableVirtualization: z.boolean().optional().default(false),
    softwareIds: z
      .array(
        z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), { message: 'Invalid software ID' })
      )
      .max(20, 'Cannot select more than 20 software packages')
      .optional()
      .default([]),
    networkType: z
      .enum(['public', 'private'], {
        invalid_type_error: 'networkType must be public or private',
      })
      .optional()
      .default('public'),
  }).superRefine((data, ctx) => {
    // Fixed password mode requires an explicit password.
    // Dynamic mode generates one per VM server-side, so none is needed.
    if (data.passwordMode === 'fixed' && (!data.consolePassword || data.consolePassword.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['consolePassword'],
        message: 'Console password is required when using a fixed password.',
      });
    }
  }),
});

// ─── Clone VM ─────────────────────────────────────────────────────────────────

export const cloneVMSchema = z.object({
  params: z.object({
    vmId: mongoObjectId,
  }),
  body: z.object({
    name: z
      .string({ required_error: 'name is required' })
      .min(3, 'Name must be at least 3 characters')
      .max(50, 'Name must be at most 50 characters')
      .regex(/^[a-zA-Z0-9-]+$/, 'Only alphanumeric characters and hyphens allowed')
      .transform((val) => val.toLowerCase()),
    count: z
      .number()
      .int('count must be an integer')
      .min(1, 'count must be at least 1')
      .max(100, 'count cannot exceed 100')
      .optional()
      .default(1),
  }),
});

// ─── VM ID param ──────────────────────────────────────────────────────────────

export const vmIdParamSchema = z.object({
  params: z.object({
    vmId: mongoObjectId,
  }),
});

// ─── Job ID param ─────────────────────────────────────────────────────────────

export const jobIdParamSchema = z.object({
  params: z.object({
    jobId: mongoObjectId,
  }),
});

// ─── Cancel job ───────────────────────────────────────────────────────────────

export const cancelJobSchema = z.object({
  params: z.object({
    jobId: mongoObjectId,
  }),
});

// ─── Template ID param ────────────────────────────────────────────────────────

export const templateIdParamSchema = z.object({
  params: z.object({
    templateId: z
      .string()
      .regex(/^\d+$/, 'templateId must be a positive integer')
      .transform(Number)
      .refine((n) => n > 0, 'templateId must be positive'),
  }),
});

// ─── VM list query ────────────────────────────────────────────────────────────

export const vmListQuerySchema = z.object({
  query: z.object({
    status: z
      .enum(['creating', 'running', 'stopped', 'paused', 'suspended', 'error', 'deleting', 'delete_failed'])
      .optional(),
    cloneType: z.enum(['dedicated_storage', 'dynamic_storage']).optional(),
    node: z
      .string()
      .max(63, 'Node name too long')
      .regex(/^[a-zA-Z0-9-]+$/, 'Invalid node name')
      .optional(),
  }),
});

// ─── VM console query ────────────────────────────────────────────────────────

export const vmConsoleSchema = z.object({
  params: z.object({
    vmId: mongoObjectId,
  }),
  query: z.object({
    protocol: z
      .enum(['rdp', 'ssh', 'vnc'], {
        invalid_type_error: 'protocol must be rdp, ssh, or vnc',
      })
      .optional(),
  }),
});

// ─── Alert history query ──────────────────────────────────────────────────────

export const alertHistoryQuerySchema = z.object({
  query: z.object({
    limit: z
      .string()
      .regex(/^\d+$/, 'limit must be a positive integer')
      .transform(Number)
      .refine((n) => n >= 1 && n <= 100, 'limit must be between 1 and 100')
      .optional()
      .default('50'),
  }),
});

// ─── Template catalog (super admin) ───────────────────────────────────────────

export const templateSelectionSchema = z.object({
  body: z.object({
    enabledVmids: z
      .array(
        z
          .number({ invalid_type_error: 'enabledVmids must be numbers' })
          .int('enabledVmids must be integers')
          .positive('enabledVmids must be positive')
      )
      .max(200, 'Cannot enable more than 200 templates at once'),
  }),
});

// ─── Bulk delete VMs ──────────────────────────────────────────────────────────

export const bulkDeleteVMsSchema = z.object({
  body: z.object({
    vmIds: z
      .array(mongoObjectId)
      .min(1, 'At least one VM must be specified')
      .max(100, 'Cannot delete more than 100 VMs at once'),
  }),
});

export const bulkPowerVMsSchema = z.object({
  body: z.object({
    vmIds: z
      .array(mongoObjectId)
      .min(1, 'At least one VM must be specified')
      .max(100, 'Cannot power on/off more than 100 VMs at once'),
  }),
});

// ─── Assign VMs ───────────────────────────────────────────────────────────────

export const assignVMsSchema = z.object({
  body: z.object({
    userId: mongoObjectId,
    vmIds: z
      .array(mongoObjectId)
      .min(1, 'At least one VM must be specified')
      .max(50, 'Cannot assign more than 50 VMs at once'),
    accessSchedule: z
      .object({
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
        startTime: z.string().nullable().optional(),
        endTime: z.string().nullable().optional(),
        weeklySchedule: z.array(z.unknown()).nullable().optional(),
        timezone: z.string().nullable().optional(),
      })
      .optional(),
  }),
});

const assignPasswordRules = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password too long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const bulkAssignPairsSchema = z.object({
  body: z
    .object({
      vmIds: z
        .array(mongoObjectId)
        .min(1, 'At least one VM must be specified')
        .max(50, 'Cannot assign more than 50 VMs at once'),
      mode: z.enum(['create', 'existing']),
      emailPrefix: z.string().email('emailPrefix must be a valid email').toLowerCase().trim().optional(),
      passwordMode: z.enum(['auto', 'shared']).optional(),
      sharedPassword: assignPasswordRules.optional(),
      userIds: z.array(mongoObjectId).optional(),
      accessSchedule: z
        .object({
          startDate: z.string().nullable().optional(),
          endDate: z.string().nullable().optional(),
          startTime: z.string().nullable().optional(),
          endTime: z.string().nullable().optional(),
          weeklySchedule: z.array(z.unknown()).nullable().optional(),
          timezone: z.string().nullable().optional(),
        })
        .optional(),
    })
    .superRefine((data, ctx) => {
      if (data.mode === 'create') {
        if (!data.emailPrefix) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'emailPrefix is required', path: ['emailPrefix'] });
        }
        if (!data.passwordMode) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'passwordMode is required', path: ['passwordMode'] });
        }
        if (data.passwordMode === 'shared' && !data.sharedPassword) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'sharedPassword is required when passwordMode is shared',
            path: ['sharedPassword'],
          });
        }
      }
      if (data.mode === 'existing') {
        if (!data.userIds?.length) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'userIds is required', path: ['userIds'] });
        } else if (data.userIds.length !== data.vmIds.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Number of users must match number of VMs',
            path: ['userIds'],
          });
        }
      }
    }),
});

export const updateVmScheduleSchema = z.object({
  params: z.object({ vmId: mongoObjectId }),
  body: z.object({
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    startTime: z.string().nullable().optional(),
    endTime: z.string().nullable().optional(),
    weeklySchedule: z.array(z.unknown()).nullable().optional(),
    timezone: z.string().nullable().optional(),
  }),
});

export const updateVmOverrideSchema = z.object({
  params: z.object({ vmId: mongoObjectId }),
  body: z.object({
    accessOverride: z.boolean(),
    accessOverrideUntil: z.string().datetime({ offset: true }).nullable().optional(),
  }),
});

export const bulkVmOverrideSchema = z.object({
  body: z.object({
    vmIds: z
      .array(mongoObjectId)
      .min(1, 'At least one VM must be specified')
      .max(200, 'Cannot override more than 200 VMs at once'),
    accessOverride: z.boolean(),
    accessOverrideUntil: z.string().datetime({ offset: true }).nullable().optional(),
  }),
});

// ─── User ID param ────────────────────────────────────────────────────────────

export const userIdParamSchema = z.object({
  params: z.object({
    userId: mongoObjectId,
  }),
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type CreateVMInput = z.infer<typeof createVMSchema>['body'];
export type CloneVMInput = z.infer<typeof cloneVMSchema>['body'];
export type BulkDeleteVMsInput = z.infer<typeof bulkDeleteVMsSchema>['body'];
export type VMListQuery = z.infer<typeof vmListQuerySchema>['query'];
export type AlertHistoryQuery = z.infer<typeof alertHistoryQuerySchema>['query'];
