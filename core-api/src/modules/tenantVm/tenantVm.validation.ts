import { z } from 'zod';
import mongoose from 'mongoose';

const mongoObjectId = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), {
    message: 'Invalid ID format',
  });

const assignPasswordRules = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password too long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const tenantVmIdParamSchema = z.object({
  params: z.object({
    vmId: mongoObjectId,
  }),
});

export const tenantUserIdParamSchema = z.object({
  params: z.object({
    userId: mongoObjectId,
  }),
});

export const tenantVmConsoleSchema = z.object({
  params: z.object({
    vmId: mongoObjectId,
  }),
  query: z.object({
    protocol: z.enum(['rdp', 'ssh', 'vnc']).optional(),
  }),
});

export const tenantVmListQuerySchema = z.object({
  query: z.object({
    status: z
      .enum(['creating', 'running', 'stopped', 'paused', 'suspended', 'error', 'deleting', 'delete_failed'])
      .optional(),
    node: z
      .string()
      .max(63, 'Node name too long')
      .regex(/^[a-zA-Z0-9-]+$/, 'Invalid node name')
      .optional(),
  }),
});

const accessScheduleBody = z
  .object({
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    startTime: z.string().nullable().optional(),
    endTime: z.string().nullable().optional(),
    weeklySchedule: z.array(z.unknown()).nullable().optional(),
    timezone: z.string().nullable().optional(),
  })
  .optional();

export const tenantVmScheduleSchema = z.object({
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

export const tenantOnboardSchema = z.object({
  body: z
    .object({
      vmIds: z
        .array(mongoObjectId)
        .min(1, 'At least one VM must be specified')
        .max(50, 'Cannot onboard more than 50 VMs at once'),
      emailPrefix: z.string().email('emailPrefix must be a valid email').toLowerCase().trim().optional(),
      passwordMode: z.enum(['auto', 'shared']),
      sharedPassword: assignPasswordRules.optional(),
      email: z.string().email('email must be a valid email').toLowerCase().trim().optional(),
      accessSchedule: accessScheduleBody,
    })
    .superRefine((data, ctx) => {
      if (data.passwordMode === 'shared' && !data.sharedPassword) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'sharedPassword is required when passwordMode is shared',
          path: ['sharedPassword'],
        });
      }

      if (data.email && data.vmIds.length !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'email is only allowed when onboarding exactly one VM',
          path: ['email'],
        });
      }

      const usesExplicitEmail = data.email && data.vmIds.length === 1;
      if (!usesExplicitEmail && !data.emailPrefix) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'emailPrefix is required unless email is provided for a single VM',
          path: ['emailPrefix'],
        });
      }
    }),
});
