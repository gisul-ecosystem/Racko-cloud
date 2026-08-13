import { z } from 'zod';

export const COMPANY_SIZE_OPTIONS = ['1-10', '11-50', '51-200', '201-500', '500+'] as const;
export const COMPANY_SIZE_SELECT_VALUE = '' as const;

export type CompanySize = (typeof COMPANY_SIZE_OPTIONS)[number];

export const DIAL_CODES = [
  { code: '+91', label: 'IN', flag: '🇮🇳' },
  { code: '+1', label: 'US', flag: '🇺🇸' },
  { code: '+44', label: 'UK', flag: '🇬🇧' },
  { code: '+971', label: 'AE', flag: '🇦🇪' },
  { code: '+65', label: 'SG', flag: '🇸🇬' },
] as const;

const nameRegex = /^[A-Za-z][A-Za-z .'-]*$/;
const phoneE164Regex = /^\+[1-9]\d{6,18}$/;
const taxIdRegex = /^[A-Za-z0-9][A-Za-z0-9\-\/]*$/;
const websiteRegex = /^https?:\/\/.+/i;

export const contactStepSchema = z.object({
  contactName: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(120, 'Name must be at most 120 characters')
    .regex(nameRegex, 'Name may only include letters, spaces, periods, hyphens, and apostrophes'),
  phone: z
    .string()
    .trim()
    .regex(phoneE164Regex, 'Enter a valid phone number with country code'),
});

export const companyStepSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(2, 'Company name must be at least 2 characters')
    .max(160, 'Company name must be at most 160 characters'),
  companyWebsite: z
    .string()
    .trim()
    .max(255)
    .refine((v) => !v || websiteRegex.test(v), {
      message: 'Website must start with http:// or https://',
    }),
  designation: z
    .string()
    .trim()
    .min(2, 'Designation must be at least 2 characters')
    .max(120, 'Designation must be at most 120 characters'),
  companySize: z.union([
    z.enum(COMPANY_SIZE_OPTIONS, {
      message: 'Select a company size',
    }),
    z.literal(COMPANY_SIZE_SELECT_VALUE).refine(() => false, {
      message: 'Select a company size',
    }),
  ]),
});

export const legalStepSchema = z.object({
  taxId: z
    .string()
    .trim()
    .min(5, 'Tax / registration ID must be at least 5 characters')
    .max(120, 'Tax / registration ID must be at most 120 characters')
    .regex(taxIdRegex, 'Tax ID may only include letters, numbers, hyphens, and slashes'),
  registeredAddress: z
    .string()
    .trim()
    .min(10, 'Address must be at least 10 characters')
    .max(500, 'Address must be at most 500 characters'),
  expectedUsage: z
    .string()
    .trim()
    .min(10, 'Expected usage must be at least 10 characters')
    .max(1000, 'Expected usage must be at most 1000 characters'),
  useCase: z
    .string()
    .trim()
    .min(10, 'Use cases must be at least 10 characters')
    .max(1000, 'Use cases must be at most 1000 characters'),
});

export const organizationOnboardingSchema = contactStepSchema
  .merge(companyStepSchema)
  .merge(legalStepSchema);

export type OrganizationOnboardingForm = z.infer<typeof organizationOnboardingSchema>;

export type FormFieldErrors = Partial<Record<keyof OrganizationOnboardingForm | 'general', string>>;

export function zodIssuesToFieldErrors(issues: z.ZodIssue[]): FormFieldErrors {
  const errors: FormFieldErrors = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !errors[key as keyof FormFieldErrors]) {
      errors[key as keyof FormFieldErrors] = issue.message;
    }
  }
  return errors;
}

export function splitPhone(value: string | undefined | null): { dialCode: string; national: string } {
  const raw = (value ?? '').trim();
  if (!raw) return { dialCode: '+91', national: '' };
  const match = DIAL_CODES.find((d) => raw.startsWith(d.code));
  if (match) {
    return { dialCode: match.code, national: raw.slice(match.code.length).replace(/\D/g, '') };
  }
  if (raw.startsWith('+')) {
    const digits = raw.slice(1).replace(/\D/g, '');
    // Prefer 1–3 digit country codes; default to +91 remainder if unsure
    for (const len of [3, 2, 1]) {
      const code = `+${digits.slice(0, len)}`;
      if (DIAL_CODES.some((d) => d.code === code)) {
        return { dialCode: code, national: digits.slice(len) };
      }
    }
    return { dialCode: '+91', national: digits };
  }
  return { dialCode: '+91', national: raw.replace(/\D/g, '') };
}

export function joinPhone(dialCode: string, national: string): string {
  const digits = national.replace(/\D/g, '');
  if (!digits) return '';
  return `${dialCode}${digits}`;
}

export function draftStorageKey(userId: string): string {
  return `racko-org-onboarding-draft:${userId}`;
}

export function stepStorageKey(userId: string): string {
  return `racko-org-onboarding-step:${userId}`;
}

export function verifiedPhoneStorageKey(userId: string): string {
  return `racko-org-onboarding-verified-phone:${userId}`;
}

/** Prefill from org register before the user has an id (keyed by email). */
export function registerDraftStorageKey(email: string): string {
  return `racko-org-register-draft:${email.trim().toLowerCase()}`;
}

export type OrgRegisterDraft = {
  contactName: string;
  companyName: string;
  phone: string;
};
