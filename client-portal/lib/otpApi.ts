import { apiRequest } from './apiClient';

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

async function unwrap<T>(promise: Promise<ApiEnvelope<T>>): Promise<T> {
  const res = await promise;
  return res.data;
}

export type PhoneOtpPurpose = 'organization_onboarding_phone';

export async function sendPhoneOtp(input: {
  phone: string;
  purpose: PhoneOtpPurpose;
}): Promise<{ expiresInSeconds: number }> {
  return unwrap(
    apiRequest<ApiEnvelope<{ expiresInSeconds: number }>>('/api/v1/otp/phone/send', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  );
}

export async function verifyPhoneOtp(input: {
  phone: string;
  purpose: PhoneOtpPurpose;
  code: string;
}): Promise<{ verified: boolean }> {
  return unwrap(
    apiRequest<ApiEnvelope<{ verified: boolean }>>('/api/v1/otp/phone/verify', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  );
}
