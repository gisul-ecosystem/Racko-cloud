import { z } from 'zod';
import mongoose from 'mongoose';

const mongoObjectId = z
  .string()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), { message: 'Invalid ID format' });

const externalVMBody = z.object({
  name: z.string({ required_error: 'name is required' }).min(1, 'name is required').max(100).trim(),
  ipAddress: z
    .string({ required_error: 'ipAddress is required' })
    .trim()
    .ip({ message: 'ipAddress must be a valid IPv4 or IPv6 address' }),
  protocol: z.enum(['rdp', 'ssh'], {
    required_error: 'protocol is required',
    invalid_type_error: 'protocol must be rdp or ssh',
  }),
  username: z.string().max(100).trim().optional(),
  password: z
    .string({ required_error: 'password is required' })
    .min(1, 'password is required')
    .max(256),
});

export const createExternalVMSchema = z.object({
  body: externalVMBody,
});

export const bulkCreateExternalVMSchema = z.object({
  body: z.object({
    vms: z
      .array(externalVMBody)
      .min(1, 'At least one VM is required')
      .max(100, 'Cannot add more than 100 VMs at once'),
  }),
});

export const externalVMIdParamSchema = z.object({
  params: z.object({ id: mongoObjectId }),
});

export const userIdParamSchema = z.object({
  params: z.object({ userId: mongoObjectId }),
});

const assignPasswordRules = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password too long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const assignExternalVMsSchema = z.object({
  body: z.object({
    userId: mongoObjectId,
    externalVmIds: z
      .array(mongoObjectId)
      .min(1, 'At least one server must be specified')
      .max(50, 'Cannot assign more than 50 servers at once'),
  }),
});

export const bulkAssignExternalPairsSchema = z.object({
  body: z
    .object({
      externalVmIds: z
        .array(mongoObjectId)
        .min(1, 'At least one server must be specified')
        .max(50, 'Cannot assign more than 50 servers at once'),
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
        if (!data.userIds?.length) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'userIds is required', path: ['userIds'] });
        } else if (data.userIds.length !== data.externalVmIds.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Number of users must match number of servers',
            path: ['userIds'],
          });
        }
      }
    }),
});

export type CreateExternalVMInput = z.infer<typeof createExternalVMSchema>['body'];
export type BulkCreateExternalVMInput = z.infer<typeof bulkCreateExternalVMSchema>['body'];
