import { z } from 'zod';

const passwordRules = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password too long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const createSingleUserSchema = z.object({
  body: z.object({
    email: z
      .string({ required_error: 'email is required' })
      .email('Invalid email format')
      .toLowerCase()
      .trim(),
    password: passwordRules,
  }),
});

export const createBulkUsersSchema = z.object({
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
    password: passwordRules.optional(),
  }),
});

export const userIdParamSchema = z.object({
  params: z.object({
    userId: z.string().min(1, 'userId is required'),
  }),
});
