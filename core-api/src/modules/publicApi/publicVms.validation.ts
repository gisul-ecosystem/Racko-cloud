import { z } from 'zod';
import { createVMSchema, vmListQuerySchema } from '../vm/vm.validation';
import { tenantOnboardSchema } from '../tenantVm/tenantVm.validation';

const mongoObjectId = z
  .string()
  .regex(/^[a-fA-F0-9]{24}$/, 'Invalid id');

export const publicVmIdParamSchema = z.object({
  params: z.object({
    id: mongoObjectId,
  }),
});

export const publicJobIdParamSchema = publicVmIdParamSchema;

export const publicVmConsoleQuerySchema = z.object({
  params: z.object({
    id: mongoObjectId,
  }),
  query: z
    .object({
      protocol: z.enum(['rdp', 'ssh', 'vnc']).optional(),
      width: z.string().optional(),
      height: z.string().optional(),
    })
    .optional(),
});

export const publicCreateVmSchema = createVMSchema;

export const publicListVmsQuerySchema = vmListQuerySchema;

const accessScheduleBodySchema = z
  .object({
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    startTime: z.string().nullable().optional(),
    endTime: z.string().nullable().optional(),
    weeklySchedule: z.array(z.unknown()).nullable().optional(),
    timezone: z.string().nullable().optional(),
  })
  .optional();

/** Platform public assign — exactly one of userId, userEmail, username. */
export const publicPlatformAssignSchema = z.object({
  body: z
    .object({
      userId: mongoObjectId.optional(),
      userEmail: z
        .string({ invalid_type_error: 'userEmail must be a string' })
        .email('userEmail must be a valid email address')
        .optional(),
      username: z
        .string({ invalid_type_error: 'username must be a string' })
        .min(1, 'username cannot be empty')
        .max(128, 'username cannot exceed 128 characters')
        .optional(),
      vmIds: z
        .array(mongoObjectId, {
          required_error: 'vmIds is required',
          invalid_type_error: 'vmIds must be an array',
        })
        .min(1, 'vmIds must include at least one VM')
        .max(50, 'vmIds cannot include more than 50 VMs'),
      accessSchedule: accessScheduleBodySchema,
    })
    .superRefine((data, ctx) => {
      const hasUserId = Boolean(data.userId);
      const hasEmail = Boolean(data.userEmail?.trim());
      const hasUsername = Boolean(data.username?.trim());
      const count = [hasUserId, hasEmail, hasUsername].filter(Boolean).length;

      if (count === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'One of userId, userEmail, or username is required',
          path: ['userId'],
        });
      } else if (count > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Provide exactly one of userId, userEmail, or username',
          path: ['userId'],
        });
      }
    }),
});

export const publicTenantAssignSchema = tenantOnboardSchema;
