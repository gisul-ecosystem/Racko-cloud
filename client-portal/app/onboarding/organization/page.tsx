'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Building2,
  Clock,
  FileText,
  Mail,
  Shield,
  User,
  Check,
} from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import { useAuth } from '@/context/AuthContext';
import {
  fetchMyOnboardingRequest,
  submitOrganizationRequest,
  type OrganizationAccessRequest,
} from '@/lib/customerOnboardingApi';
import {
  COMPANY_SIZE_OPTIONS,
  COMPANY_SIZE_SELECT_VALUE,
  DIAL_CODES,
  companyStepSchema,
  contactStepSchema,
  draftStorageKey,
  registerDraftStorageKey,
  joinPhone,
  legalStepSchema,
  organizationOnboardingSchema,
  splitPhone,
  stepStorageKey,
  verifiedPhoneStorageKey,
  zodIssuesToFieldErrors,
  type FormFieldErrors,
  type OrganizationOnboardingForm,
  type OrgRegisterDraft,
} from '@/lib/organizationOnboardingSchema';
import { sendPhoneOtp, verifyPhoneOtp } from '@/lib/otpApi';

const STEPPER = [
  { id: 1, title: 'Contact', subtitle: 'Contact Information' },
  { id: 2, title: 'Company', subtitle: 'Company Details' },
  { id: 3, title: 'Legal', subtitle: 'Legal Information' },
] as const;

const TOTAL_PROGRESS_STEPS = STEPPER.length;

type OnboardingStep = (typeof STEPPER)[number]['id'];

const EMPTY_FORM: OrganizationOnboardingForm = {
  contactName: '',
  phone: '',
  companyName: '',
  companyWebsite: '',
  designation: '',
  companySize: COMPANY_SIZE_SELECT_VALUE,
  taxId: '',
  registeredAddress: '',
  expectedUsage: '',
  useCase: '',
};

const inputClass =
  'w-full rounded-lg border border-gray-700 bg-[#0f172a] py-2.5 pl-10 pr-3 text-sm text-white placeholder-gray-500 focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]';
const textareaClass =
  'w-full rounded-lg border border-gray-700 bg-[#0f172a] px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]';
const labelClass = 'mb-1.5 block text-sm font-medium text-gray-200';
const PHONE_OTP_PURPOSE = 'organization_onboarding_phone' as const;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-400">{message}</p>;
}

function TextInput({
  label,
  icon,
  error,
  readOnly,
  className,
  ...props
}: {
  label: string;
  icon: ReactNode;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
          {icon}
        </span>
        <input
          readOnly={readOnly}
          className={`${inputClass}${error ? ' border-red-500' : ''}${
            readOnly ? ' cursor-not-allowed opacity-80' : ''
          }${className ? ` ${className}` : ''}`}
          {...props}
        />
      </div>
      <FieldError message={error} />
    </div>
  );
}

function PhoneField({
  label,
  dialCode,
  national,
  onDialChange,
  onNationalChange,
  error,
  action,
  placeholder = '**********',
}: {
  label: string;
  dialCode: string;
  national: string;
  onDialChange: (code: string) => void;
  onNationalChange: (value: string) => void;
  error?: string;
  action?: ReactNode;
  placeholder?: string;
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className={`flex overflow-hidden rounded-lg border bg-[#0f172a]${error ? ' border-red-500' : ' border-gray-700'}`}>
        <select
          value={dialCode}
          onChange={(e) => onDialChange(e.target.value)}
          className="shrink-0 border-r border-gray-700 bg-[#0f172a] px-2 py-2.5 text-sm text-white focus:outline-none"
          aria-label={`${label} country code`}
        >
          {DIAL_CODES.map((d) => (
            <option key={d.code} value={d.code}>
              {d.flag} {d.code}
            </option>
          ))}
        </select>
        <input
          type="tel"
          inputMode="numeric"
          value={national}
          onChange={(e) => onNationalChange(e.target.value.replace(/\D/g, '').slice(0, 15))}
          placeholder={placeholder}
          className="w-full bg-transparent px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none"
        />
        {action ? <div className="shrink-0 border-l border-gray-700">{action}</div> : null}
      </div>
      <FieldError message={error} />
    </div>
  );
}

export default function OrganizationOnboardingPage() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const [request, setRequest] = useState<OrganizationAccessRequest | null>(null);
  const [loadingRequest, setLoadingRequest] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FormFieldErrors>({});
  const [step, setStep] = useState(1);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [form, setForm] = useState<OrganizationOnboardingForm>(EMPTY_FORM);
  const [phoneDial, setPhoneDial] = useState('+91');
  const [phoneNational, setPhoneNational] = useState('');
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpSentTo, setOtpSentTo] = useState<string | null>(null);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpMessage, setOtpMessage] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !user) {
      router.replace('/login?redirect=/onboarding/organization');
      return;
    }
    if (user.accountType !== 'b2b') {
      router.replace(user.role === 'admin' ? '/console' : '/dashboard/user');
      return;
    }

    void (async () => {
      try {
        const existing = await fetchMyOnboardingRequest();
        setRequest(existing);

        let next = { ...EMPTY_FORM };
        if (existing && existing.status === 'rejected') {
          next = {
            contactName: existing.contactName ?? '',
            phone: existing.phone ?? '',
            companyName: existing.companyName ?? '',
            companyWebsite: existing.companyWebsite ?? '',
            designation: existing.designation ?? '',
            companySize:
              (COMPANY_SIZE_OPTIONS as readonly string[]).includes(existing.companySize ?? '')
                ? (existing.companySize as OrganizationOnboardingForm['companySize'])
                : COMPANY_SIZE_SELECT_VALUE,
            registeredAddress: existing.registeredAddress ?? '',
            taxId: existing.taxId ?? '',
            useCase: existing.useCase ?? '',
            expectedUsage: existing.expectedUsage ?? '',
          };
        } else if (!existing || existing.status === 'more_info_required') {
          try {
            const raw = localStorage.getItem(draftStorageKey(user.id));
            if (raw) {
              const parsed = JSON.parse(raw) as Partial<OrganizationOnboardingForm>;
              next = { ...EMPTY_FORM, ...parsed };
            } else {
              const regRaw = localStorage.getItem(registerDraftStorageKey(user.email));
              if (regRaw) {
                const reg = JSON.parse(regRaw) as OrgRegisterDraft;
                next = {
                  ...EMPTY_FORM,
                  contactName: reg.contactName ?? '',
                  companyName: reg.companyName ?? '',
                  phone: reg.phone ?? '',
                };
                localStorage.setItem(draftStorageKey(user.id), JSON.stringify(next));
                localStorage.removeItem(registerDraftStorageKey(user.email));
              } else {
                // Fallback: prefill from sign-in credentials (name + phone from registration)
                next = {
                  ...EMPTY_FORM,
                  contactName: user.name ?? '',
                  phone: user.phone ?? '',
                };
              }
            }
          } catch {
            // ignore corrupt draft
          }
        }

        setForm(next);
        const phoneParts = splitPhone(next.phone);
        setPhoneDial(phoneParts.dialCode);
        setPhoneNational(phoneParts.national);
        const storedVerifiedPhone = localStorage.getItem(verifiedPhoneStorageKey(user.id));
        if (storedVerifiedPhone && storedVerifiedPhone === next.phone) {
          setVerifiedPhone(storedVerifiedPhone);
        }
        const storedStep = Number(localStorage.getItem(stepStorageKey(user.id)));
        if (storedStep >= 1 && storedStep <= TOTAL_PROGRESS_STEPS) {
          setStep(storedStep as OnboardingStep);
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load organization onboarding.');
      } finally {
        setLoadingRequest(false);
      }
    })();
  }, [isLoading, isAuthenticated, user, router]);

  function updateForm<K extends keyof OrganizationOnboardingForm>(key: K, value: OrganizationOnboardingForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setDraftSaved(false);
  }

  function syncPhonesIntoForm(): OrganizationOnboardingForm {
    const phone = joinPhone(phoneDial, phoneNational);
    const next = { ...form, phone };
    setForm(next);
    return next;
  }

  function currentPhone(): string {
    return joinPhone(phoneDial, phoneNational);
  }

  function resetPhoneOtpState() {
    setVerifiedPhone(null);
    setOtpSentTo(null);
    setOtpCode('');
    setOtpMessage(null);
    setOtpError(null);
    if (user) localStorage.removeItem(verifiedPhoneStorageKey(user.id));
  }

  function handleDialChange(code: string) {
    setPhoneDial(code);
    resetPhoneOtpState();
  }

  function handleNationalChange(value: string) {
    setPhoneNational(value);
    resetPhoneOtpState();
  }

  function validatePhoneForOtp(phone: string): boolean {
    const result = contactStepSchema.pick({ phone: true }).safeParse({ phone });
    if (!result.success) {
      setFieldErrors((prev) => ({ ...prev, phone: result.error.issues[0]?.message ?? 'Enter a valid phone number' }));
      return false;
    }
    setFieldErrors((prev) => {
      if (!prev.phone) return prev;
      const next = { ...prev };
      delete next.phone;
      return next;
    });
    return true;
  }

  async function handleSendOtp() {
    const phone = currentPhone();
    if (!validatePhoneForOtp(phone)) return;

    setOtpSending(true);
    setOtpError(null);
    setOtpMessage(null);
    try {
      const result = await sendPhoneOtp({ phone, purpose: PHONE_OTP_PURPOSE });
      setOtpSentTo(phone);
      setOtpCode('');
      setOtpMessage(`OTP sent. It expires in ${Math.ceil(result.expiresInSeconds / 60)} minute(s).`);
    } catch (err) {
      setOtpError(err instanceof ApiError ? err.message : 'Failed to send OTP.');
    } finally {
      setOtpSending(false);
    }
  }

  async function handleVerifyOtp() {
    const phone = currentPhone();
    if (!validatePhoneForOtp(phone)) return;
    if (!otpCode.trim()) {
      setOtpError('Enter the OTP sent to your phone.');
      return;
    }

    setOtpVerifying(true);
    setOtpError(null);
    setOtpMessage(null);
    try {
      await verifyPhoneOtp({ phone, purpose: PHONE_OTP_PURPOSE, code: otpCode.trim() });
      setVerifiedPhone(phone);
      if (user) localStorage.setItem(verifiedPhoneStorageKey(user.id), phone);
      setOtpMessage('Phone number verified.');
    } catch (err) {
      setOtpError(err instanceof ApiError ? err.message : 'Failed to verify OTP.');
    } finally {
      setOtpVerifying(false);
    }
  }

  function validateCurrentStep(data: OrganizationOnboardingForm): boolean {
    const schema =
      step === 1 ? contactStepSchema : step === 2 ? companyStepSchema : legalStepSchema;
    const result = schema.safeParse(data);
    if (!result.success) {
      setFieldErrors(zodIssuesToFieldErrors(result.error.issues));
      return false;
    }
    setFieldErrors({});
    return true;
  }

  function handleSaveDraft() {
    if (!user) return;
    const data = syncPhonesIntoForm();
    localStorage.setItem(draftStorageKey(user.id), JSON.stringify(data));
    setDraftSaved(true);
    setError(null);
  }

  function handleContinue() {
    const data = syncPhonesIntoForm();
    if (!validateCurrentStep(data)) return;
    if (step === 1 && verifiedPhone !== data.phone) {
      setOtpError('Verify your phone number before continuing.');
      return;
    }
    const nextStep = Math.min(step + 1, TOTAL_PROGRESS_STEPS) as OnboardingStep;
    setStep(nextStep);
    if (user) {
      localStorage.setItem(draftStorageKey(user.id), JSON.stringify(data));
      localStorage.setItem(stepStorageKey(user.id), String(nextStep));
    }
  }

  async function handleSubmit() {
    const data = syncPhonesIntoForm();
    const result = organizationOnboardingSchema.safeParse(data);
    if (!result.success) {
      setFieldErrors(zodIssuesToFieldErrors(result.error.issues));
      // Jump to first step that has errors
      const keys = result.error.issues.map((i) => String(i.path[0]));
      const nextStep = keys.some((k) => ['contactName', 'phone'].includes(k))
        ? 1
        : keys.some((k) => ['companyName', 'companyWebsite', 'designation', 'companySize'].includes(k))
          ? 2
          : 3;
      setStep(nextStep);
      if (user) {
        localStorage.setItem(draftStorageKey(user.id), JSON.stringify(data));
        localStorage.setItem(stepStorageKey(user.id), String(nextStep));
      }
      return;
    }
    if (verifiedPhone !== result.data.phone) {
      setStep(1);
      if (user) localStorage.setItem(stepStorageKey(user.id), '1');
      setOtpError('Verify your phone number before submitting organization details.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...result.data,
        companyWebsite: result.data.companyWebsite || undefined,
      };
      const next = await submitOrganizationRequest(payload);
      setRequest(next);
      setJustSubmitted(true);
      if (user) {
        localStorage.removeItem(draftStorageKey(user.id));
        localStorage.removeItem(stepStorageKey(user.id));
        localStorage.removeItem(verifiedPhoneStorageKey(user.id));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to submit organization request.');
    } finally {
      setSaving(false);
    }
  }

  if (isLoading || !isAuthenticated || !user || loadingRequest) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0f1e] text-white">
        Loading...
      </div>
    );
  }

  const lockedStatus = request?.status === 'pending' || request?.status === 'approved';

  if (justSubmitted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black px-4 text-center">
        <div className="relative mb-8">
          <span className="absolute -right-2 -top-1 h-2 w-2 rotate-45 bg-[#B91C1C]" />
          <span className="absolute -bottom-1 -left-2 h-2 w-2 bg-gray-700" />
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#B91C1C]">
            <Check className="h-8 w-8 text-white" strokeWidth={3} />
          </div>
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          <span className="text-white">Request </span>
          <span className="text-[#EF4444]">Submitted!</span>
        </h1>
        <p className="mt-4 max-w-md text-sm text-gray-400 sm:text-base">
          Thank you! Your organization request has been sent to Racko Admin for review.
        </p>
      </div>
    );
  }

  if (lockedStatus && request) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] px-4 py-10 text-white">
        <div className="mx-auto max-w-3xl rounded-2xl border border-gray-800 bg-[#111827] p-8">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-red-950/30 px-3 py-1 text-xs font-semibold text-[#F87171]">
              B2B
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-wide text-gray-200">
              {request.status.replace(/_/g, ' ')}
            </span>
          </div>
          <h1 className="text-2xl font-semibold">Organization onboarding</h1>
          <div className="mt-6 rounded-xl border border-gray-800 bg-black/20 p-5 text-sm text-gray-300">
            <p>
              <span className="font-semibold text-white">Company:</span> {request.companyName}
            </p>
            <p className="mt-2">
              <span className="font-semibold text-white">NDA status:</span>{' '}
              {request.ndaStatus.replace(/_/g, ' ')}
            </p>
            {request.reviewerNotes ? (
              <p className="mt-2">
                <span className="font-semibold text-white">Reviewer notes:</span> {request.reviewerNotes}
              </p>
            ) : null}
            {request.status === 'approved' ? (
              <button
                type="button"
                onClick={() => router.push('/console')}
                className="mt-4 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white"
              >
                Go to console
              </button>
            ) : (
              <p className="mt-4 text-xs text-gray-400">
                Your request is under review. You can stay on this page and check back later.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const progressStep = step;
  const completedProgressSteps = Math.max(step - 1, 0);

  const sectionMeta =
    step === 1
      ? {
          title: 'Contact Information',
          subtitle: "We'll use this to reach out to you regarding your request.",
        }
      : step === 2
        ? {
            title: 'Company Details',
            subtitle: "We'll use this to reach out to you regarding your request.",
          }
        : {
            title: 'Legal Information',
            subtitle: "We'll use this to reach out to you regarding your request.",
          };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0f1e] px-4 py-8 text-white sm:py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 0% 0%, rgba(185,28,28,0.18), transparent 55%), radial-gradient(ellipse 50% 40% at 100% 100%, rgba(185,28,28,0.12), transparent 50%)',
        }}
      />

      <div className="relative mx-auto flex h-[calc(100vh-4rem)] min-h-[720px] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-gray-800/80 bg-[#111827]/95 shadow-2xl shadow-black/40 sm:h-[calc(100vh-6rem)]">
        <div className="border-b border-gray-800 px-6 py-5 sm:px-8">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <span className="relative h-9 w-10 shrink-0 overflow-hidden rounded-md">
              <Image
                src="/images/racko-logo1.png"
                alt=""
                width={148}
                height={40}
                priority
                aria-hidden
                className="absolute left-0 top-0 h-9 w-auto max-w-none"
              />
            </span>
            <span className="text-xl font-bold tracking-tight text-white">Racko</span>
          </Link>

          <div className="mt-6">
            <span className="inline-block rounded bg-[#B91C1C] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              B2B
            </span>
            <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              {step === 2 ? 'Company Details' : "Let's set up your organization"}
            </h1>
            <p className="mt-1.5 text-sm text-gray-400">
              Fill in your details to get access to Racko.
            </p>
          </div>

          <nav className="mx-auto mt-8 flex w-full max-w-3xl items-start justify-center gap-4" aria-label="Onboarding steps">
            {STEPPER.map((item, idx) => {
              const active = step === item.id;
              const done = step > item.id;
              return (
                <div key={item.id} className="flex min-w-0 items-center">
                  <div className="flex w-28 shrink-0 flex-col items-center text-center sm:w-36 sm:flex-row sm:items-center sm:gap-3 sm:text-left">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                        active || done
                          ? 'bg-[#B91C1C] text-white'
                          : 'border border-gray-600 text-gray-500'
                      }`}
                    >
                      {done ? <Check className="h-4 w-4" /> : item.id}
                    </span>
                    <div className="mt-2 min-w-0 sm:mt-0">
                      <p className={`truncate text-sm font-semibold ${active || done ? 'text-white' : 'text-gray-500'}`}>
                        {item.title}
                      </p>
                      <p className={`hidden truncate text-xs sm:block ${active ? 'text-[#F87171]' : 'text-gray-600'}`}>
                        {item.subtitle}
                      </p>
                    </div>
                  </div>
                  {idx < STEPPER.length - 1 ? (
                    <div className="ml-4 hidden h-px w-20 shrink-0 bg-gray-700 sm:block" />
                  ) : null}
                </div>
              );
            })}
          </nav>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
          {error ? (
            <div className="mb-4 rounded-lg bg-red-900/30 px-4 py-3 text-sm text-red-300">{error}</div>
          ) : null}
          {draftSaved ? (
            <div className="mb-4 rounded-lg bg-green-900/30 px-4 py-3 text-sm text-green-300">
              Draft saved on this device. You can continue later.
            </div>
          ) : null}
          {request?.status === 'rejected' ? (
            <div className="mb-4 rounded-lg bg-amber-900/30 px-4 py-3 text-sm text-amber-200">
              Your previous request was rejected
              {request.reviewerNotes ? `: ${request.reviewerNotes}` : '.'} Please update your details and
              resubmit.
            </div>
          ) : null}

          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <User className="mt-0.5 h-5 w-5 text-[#EF4444]" />
              <div>
                <h2 className="text-base font-semibold text-white">{sectionMeta.title}</h2>
                <p className="text-xs text-gray-400">{sectionMeta.subtitle}</p>
              </div>
            </div>
          </div>

          {step === 1 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput
                label="Name"
                icon={<User className="h-4 w-4" />}
                value={form.contactName}
                onChange={(e) => updateForm('contactName', e.target.value)}
                placeholder="Enter Your Name"
                error={fieldErrors.contactName}
                autoComplete="name"
              />
              <TextInput
                label="Work Email"
                icon={<Mail className="h-4 w-4" />}
                value={user.email}
                readOnly
                placeholder="your@company.com"
              />
              <PhoneField
                label="Phone Number"
                dialCode={phoneDial}
                national={phoneNational}
                onDialChange={handleDialChange}
                onNationalChange={handleNationalChange}
                error={fieldErrors.phone}
                action={
                  <button
                    type="button"
                    onClick={() => void handleSendOtp()}
                    disabled={otpSending || verifiedPhone === currentPhone()}
                    className="h-full px-3 text-xs font-semibold text-[#FCA5A5] hover:bg-[#1a2332] disabled:cursor-not-allowed disabled:text-green-400"
                  >
                    {verifiedPhone === currentPhone() ? 'Verified' : otpSending ? 'Sending...' : otpSentTo === currentPhone() ? 'Resend' : 'Verify'}
                  </button>
                }
              />
              <div className="sm:col-span-2">
                {otpSentTo === currentPhone() && verifiedPhone !== currentPhone() ? (
                  <div className="grid gap-3 rounded-lg border border-gray-800 bg-[#0b1220] p-3 sm:grid-cols-[1fr_auto] sm:items-start">
                    <div>
                      <label className={labelClass}>Phone OTP</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="Enter 6 digit OTP"
                        className="w-full rounded-lg border border-gray-700 bg-[#0f172a] px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleVerifyOtp()}
                      disabled={otpVerifying || otpCode.length !== 6}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#B91C1C] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#DC2626] disabled:cursor-not-allowed disabled:opacity-50 sm:mt-6"
                    >
                      {otpVerifying ? 'Verifying...' : 'Verify OTP'}
                    </button>
                  </div>
                ) : null}
                {verifiedPhone === currentPhone() ? (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-green-400">
                    <Check className="h-3.5 w-3.5" /> Phone number verified
                  </p>
                ) : null}
                {otpMessage ? <p className="mt-2 text-xs text-green-400">{otpMessage}</p> : null}
                {otpError ? <p className="mt-2 text-xs text-red-400">{otpError}</p> : null}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput
                label="Company Name"
                icon={<Building2 className="h-4 w-4" />}
                value={form.companyName}
                onChange={(e) => updateForm('companyName', e.target.value)}
                placeholder="Enter Your Company Name"
                error={fieldErrors.companyName}
              />
              <TextInput
                label="Company Website"
                icon={<Mail className="h-4 w-4" />}
                value={form.companyWebsite}
                onChange={(e) => updateForm('companyWebsite', e.target.value)}
                placeholder="https://company.com"
                error={fieldErrors.companyWebsite}
              />
              <TextInput
                label="Designation"
                icon={<User className="h-4 w-4" />}
                value={form.designation}
                onChange={(e) => updateForm('designation', e.target.value)}
                placeholder="e.g. Engineering Manager"
                error={fieldErrors.designation}
              />
              <div>
                <label className={labelClass}>Company Size</label>
                <select
                  value={form.companySize}
                  onChange={(e) =>
                    updateForm('companySize', e.target.value as OrganizationOnboardingForm['companySize'])
                  }
                  className={`w-full rounded-lg border bg-[#0f172a] px-3 py-2.5 text-sm text-white focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]${
                    fieldErrors.companySize ? ' border-red-500' : ' border-gray-700'
                  }`}
                >
                  <option value={COMPANY_SIZE_SELECT_VALUE} disabled>
                    Select
                  </option>
                  {COMPANY_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                <FieldError message={fieldErrors.companySize} />
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="grid gap-4">
              <TextInput
                label="Tax & Registration ID"
                icon={<FileText className="h-4 w-4" />}
                value={form.taxId}
                onChange={(e) => updateForm('taxId', e.target.value)}
                placeholder="Enter Tax / Registration ID"
                error={fieldErrors.taxId}
              />
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className={labelClass}>Registration Address</label>
                  <textarea
                    rows={4}
                    value={form.registeredAddress}
                    onChange={(e) => updateForm('registeredAddress', e.target.value)}
                    placeholder="Enter Your Registration Address"
                    className={`${textareaClass}${fieldErrors.registeredAddress ? ' border-red-500' : ''}`}
                  />
                  <FieldError message={fieldErrors.registeredAddress} />
                </div>
                <div>
                  <label className={labelClass}>Expected Usages</label>
                  <textarea
                    rows={4}
                    value={form.expectedUsage}
                    onChange={(e) => updateForm('expectedUsage', e.target.value)}
                    placeholder="Describe expected usage"
                    className={`${textareaClass}${fieldErrors.expectedUsage ? ' border-red-500' : ''}`}
                  />
                  <FieldError message={fieldErrors.expectedUsage} />
                </div>
                <div>
                  <label className={labelClass}>Use Cases</label>
                  <textarea
                    rows={4}
                    value={form.useCase}
                    onChange={(e) => updateForm('useCase', e.target.value)}
                    placeholder="Describe your use cases"
                    className={`${textareaClass}${fieldErrors.useCase ? ' border-red-500' : ''}`}
                  />
                  <FieldError message={fieldErrors.useCase} />
                </div>
              </div>
            </div>
          ) : null}

          {/* <div className="mt-6 flex items-start gap-3 rounded-xl border border-gray-800 bg-[#0b1220] px-4 py-3">
            <Shield className="mt-0.5 h-5 w-5 shrink-0 text-[#EF4444]" />
            <div>
              <p className="text-sm font-semibold text-white">Your data is safe with us</p>
              <p className="text-xs text-gray-400">
                We use industry-standard encryption to protect your information.
              </p>
            </div>
          </div> */}
        </div>

        <div className="grid gap-4 border-t border-gray-800 bg-[#0d1424] px-6 py-4 sm:grid-cols-3 sm:items-center sm:px-8">
          {/* <button
            type="button"
            onClick={handleSaveDraft}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-[#1a2332] px-4 py-2.5 text-sm font-medium text-gray-200 hover:bg-[#243044]"
          >
            <FileText className="h-4 w-4" />
            <span className="text-left">
              <span className="block leading-tight">Save Draft</span>
              <span className="block text-[10px] font-normal text-gray-500">You can continue later.</span>
            </span>
          </button> */}

          {step > 1 ? (
            <button
              type="button"
              onClick={() => {
                const nextStep = Math.max(step - 1, 1) as OnboardingStep;
                setStep(nextStep);
                if (user) localStorage.setItem(stepStorageKey(user.id), String(nextStep));
              }}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-700 bg-[#1a2332] px-5 py-2.5 text-sm font-medium text-gray-200 hover:bg-[#243044] sm:justify-self-start"
            >
              ← Back
            </button>
          ) : (
            <div className="hidden sm:block" />
          )}

          <div className="flex flex-col items-center gap-1.5 sm:justify-self-center">
            <div className="flex w-full items-center justify-between gap-4 text-[11px] text-gray-400 sm:w-56">
              <span>
                Step {progressStep} of {TOTAL_PROGRESS_STEPS}
              </span>
            </div>
            <div className="flex w-full gap-1 sm:w-56">
              {Array.from({ length: TOTAL_PROGRESS_STEPS }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full ${
                    i < completedProgressSteps ? 'bg-[#B91C1C]' : 'bg-gray-700'
                  }`}
                />
              ))}
            </div>
          </div>

          {step < 3 ? (
            <button
              type="button"
              onClick={handleContinue}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#B91C1C] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#DC2626] sm:justify-self-end"
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSubmit()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#B91C1C] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#DC2626] disabled:opacity-50 sm:justify-self-end"
            >
              {saving ? 'Submitting...' : 'Submit'}
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
