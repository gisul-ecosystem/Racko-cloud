import { z } from 'zod';
import { passwordSchema } from '../tenant/tenant.validation';

export const createSingleTenantUserSchema = z.object({
  body: z.object({
    email: z
      .string({ required_error: 'email is required' })
      .email('Invalid email format')
      .toLowerCase()
      .trim(),
    password: passwordSchema,
  }),
});

export const createBulkTenantUsersSchema = z.object({
  body: z.object({
    emailPrefix: z
      .string({ required_error: 'emailPrefix is required' })
      .email('emailPrefix must be a valid email address (e.g. user@gmail.com)')
      .toLowerCase()
      .trim(),
    count: z
      .number({ required_error: 'count is required' })
      .int('count must be an integer')
      .min(1, 'count must be at least 1')
      .max(100, 'count cannot exceed 100'),
    password: passwordSchema.optional(),
  }),
});

export const tenantUserIdParamSchema = z.object({
  params: z.object({
    userId: z.string().min(1, 'userId is required'),
  }),
});

export const setTenantUserActiveSchema = z.object({
  params: z.object({
    userId: z.string().min(1, 'userId is required'),
  }),
  body: z.object({
    isActive: z.boolean({ required_error: 'isActive is required' }),
  }),
});
