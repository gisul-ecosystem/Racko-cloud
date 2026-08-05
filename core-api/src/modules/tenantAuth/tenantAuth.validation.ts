import { z } from 'zod';
import { passwordSchema } from '../tenant/tenant.validation';

export const tenantLoginSchema = z.object({
  body: z.object({
    email: z
      .string()
      .min(1, 'Email is required')
      .email('Invalid email format')
      .toLowerCase()
      .trim(),
    password: z.string().min(1, 'Password is required'),
  }),
});

export const tenantForgotPasswordSchema = z.object({
  body: z.object({
    email: z
      .string()
      .min(1, 'Email is required')
      .email('Invalid email format')
      .toLowerCase()
      .trim(),
  }),
});

export const tenantResetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Token is required').max(256, 'Invalid token'),
    newPassword: passwordSchema,
  }),
});

export const tenantVerifyEmailSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Token is required').max(256, 'Invalid token'),
  }),
});

export const tenantResendVerificationSchema = z.object({
  body: z.object({
    email: z
      .string()
      .min(1, 'Email is required')
      .email('Invalid email format')
      .toLowerCase()
      .trim(),
  }),
});

export type TenantLoginInput = z.infer<typeof tenantLoginSchema>['body'];
export type TenantForgotPasswordInput = z.infer<typeof tenantForgotPasswordSchema>['body'];
export type TenantResetPasswordInput = z.infer<typeof tenantResetPasswordSchema>['body'];
export type TenantVerifyEmailInput = z.infer<typeof tenantVerifyEmailSchema>['body'];
export type TenantResendVerificationInput = z.infer<
  typeof tenantResendVerificationSchema
>['body'];
