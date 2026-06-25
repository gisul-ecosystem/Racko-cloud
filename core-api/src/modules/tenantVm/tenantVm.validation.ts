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

export const tenantAssignVMsSchema = z.object({
  body: z.object({
    userId: mongoObjectId,
    vmIds: z
      .array(mongoObjectId)
      .min(1, 'At least one VM must be specified')
      .max(50, 'Cannot assign more than 50 VMs at once'),
  }),
});

export const tenantBulkAssignPairsSchema = z.object({
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
        if (!data.userIds || data.userIds.length === 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'userIds is required', path: ['userIds'] });
        } else if (data.userIds.length !== data.vmIds.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'userIds length must match vmIds length',
            path: ['userIds'],
          });
        }
      }
    }),
});
