import { z } from 'zod';

const phoneE164Schema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{6,18}$/, 'Enter a valid phone number with country code');

export const sendPhoneOtpSchema = z.object({
  body: z.object({
    phone: phoneE164Schema,
    purpose: z.literal('organization_onboarding_phone'),
  }),
});

export const verifyPhoneOtpSchema = z.object({
  body: z.object({
    phone: phoneE164Schema,
    purpose: z.literal('organization_onboarding_phone'),
    code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6 digit OTP'),
  }),
});

export type SendPhoneOtpInput = z.infer<typeof sendPhoneOtpSchema>['body'];
export type VerifyPhoneOtpInput = z.infer<typeof verifyPhoneOtpSchema>['body'];
