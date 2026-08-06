'use client';

import { Suspense, useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { z } from 'zod';
import { Building2, Eye, EyeOff, KeyRound, Mail, Phone, User, UserRound } from 'lucide-react';
import { apiRequest, ApiError } from '../../../lib/apiClient';
import {
  registerDraftStorageKey,
  type OrgRegisterDraft,
} from '@/lib/organizationOnboardingSchema';

const LINK_ACCENT = 'text-[#EF4444] hover:text-[#DC2626] font-medium';

const passwordRules = z
  .string()
  .min(8, 'At least 8 characters')
  .regex(/[A-Z]/, 'Must include an uppercase letter')
  .regex(/[a-z]/, 'Must include a lowercase letter')
  .regex(/[0-9]/, 'Must include a number')
  .regex(/[^A-Za-z0-9]/, 'Must include a special character');

const individualRegisterSchema = z
  .object({
    email: z.string().email('Invalid email address').max(254),
    password: passwordRules,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

const orgRegisterSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(120)
      .regex(
        /^[A-Za-z][A-Za-z .'-]*$/,
        'Name may only include letters, spaces, periods, hyphens, and apostrophes'
      ),
    email: z.string().email('Invalid email address').max(254),
    companyName: z.string().trim().min(2, 'Company name must be at least 2 characters').max(160),
    phone: z
      .string()
      .trim()
      .regex(/^\+[1-9]\d{6,18}$/, 'Use format +91XXXXXXXXXX'),
    password: passwordRules,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type FormErrors = Partial<
  Record<
    'fullName' | 'email' | 'companyName' | 'phone' | 'password' | 'confirmPassword' | 'general',
    string
  >
>;

interface RegisterResponse {
  message: string;
}

function Field({
  label,
  icon,
  error,
  trailing,
  ...props
}: {
  label: string;
  icon: ReactNode;
  error?: string;
  trailing?: ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="min-w-0">
      <label className="mb-0.5 block text-xs font-medium text-gray-400">{label}</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
          {icon}
        </span>
        <input
          {...props}
          className={`w-full rounded-lg border border-gray-700 bg-black py-1.5 pl-10 text-sm text-white placeholder-gray-500 transition focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C] disabled:opacity-60 ${
            trailing ? 'pr-10' : 'pr-3'
          } ${error ? 'border-red-500' : ''}`}
        />
        {trailing ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">{trailing}</span>
        ) : null}
      </div>
      {error ? <p className="mt-0.5 text-[11px] leading-tight text-red-400">{error}</p> : null}
    </div>
  );
}

function HeroPanel() {
  return (
    <div className="relative hidden h-dvh overflow-hidden bg-black lg:block">
      <Image
        src="/images/auth-hero.webp"
        alt=""
        fill
        priority
        sizes="55vw"
        className="object-cover object-[center_15%]"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-transparent"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent"
      />

      <div className="relative z-10 flex h-full flex-col justify-between px-10 py-12 xl:px-14">
        <div className="relative mx-auto mt-[6%] h-[52%] w-full max-w-2xl">
          <div className="absolute left-[2%] top-0 w-40 rounded-xl border border-white/10 bg-black/60 p-3 shadow-lg backdrop-blur-md">
            <p className="text-[10px] font-medium text-gray-300">AI/Cloud Edition</p>
            <svg viewBox="0 0 100 28" className="mt-2 h-7 w-full" aria-hidden>
              <polyline
                fill="none"
                stroke="#22c55e"
                strokeWidth="2"
                points="0,20 15,18 30,12 45,16 60,8 75,14 90,6 100,10"
              />
              <polyline
                fill="none"
                stroke="#ef4444"
                strokeWidth="1.5"
                opacity="0.85"
                points="0,22 20,19 40,21 60,15 80,18 100,12"
              />
            </svg>
          </div>

          <div className="absolute right-[4%] top-[14%] w-40 rounded-xl border border-white/10 bg-black/60 p-3 shadow-lg backdrop-blur-md">
            <p className="text-[10px] text-gray-400">Server Uptime</p>
            <p className="mt-1 text-lg font-semibold text-white">8.39m</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-800">
              <div className="h-full w-[82%] rounded-full bg-gradient-to-r from-emerald-500 to-gray-500" />
            </div>
          </div>

          <div className="absolute bottom-[4%] left-[8%] w-40 rounded-xl border border-white/10 bg-black/60 p-3 shadow-lg backdrop-blur-md">
            <p className="text-[10px] text-gray-400">GPU Workloads</p>
            <p className="mt-1 text-lg font-semibold text-white">1000MB</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-800">
              <div className="h-full w-[70%] rounded-full bg-gradient-to-r from-emerald-500 to-gray-600" />
            </div>
          </div>

          <div className="absolute bottom-[10%] right-[10%] w-36 rounded-xl border border-white/10 bg-black/60 p-3 shadow-lg backdrop-blur-md">
            <p className="text-[10px] text-gray-400">Deployment</p>
            <svg viewBox="0 0 80 28" className="mt-1 h-7 w-full" aria-hidden>
              <path
                d="M0,24 L10,20 L20,22 L30,12 L40,16 L50,8 L60,14 L70,6 L80,10 L80,28 L0,28 Z"
                fill="rgba(239,68,68,0.35)"
              />
              <polyline
                fill="none"
                stroke="#ef4444"
                strokeWidth="1.5"
                points="0,24 10,20 20,22 30,12 40,16 50,8 60,14 70,6 80,10"
              />
            </svg>
          </div>

          <div className="absolute right-0 top-[46%] w-32 rounded-xl border border-white/10 bg-black/60 p-3 shadow-lg backdrop-blur-md">
            <p className="text-[10px] text-gray-400">Analytics</p>
            <div className="mt-2 flex h-8 items-end gap-1">
              {[40, 65, 45, 80, 55, 90, 70].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm bg-[#EF4444]/85"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>
        </div>

        <p className="mx-auto mb-4 max-w-xl text-center text-2xl font-bold leading-snug tracking-tight text-white xl:text-[28px]">
          Build and scale without infrastructure complexity.
        </p>
      </div>
    </div>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialType = searchParams.get('type') === 'b2c' ? 'b2c' : 'b2b';
  const [accountType, setAccountType] = useState<'b2c' | 'b2b'>(initialType);

  function selectAccountType(next: 'b2c' | 'b2b') {
    setAccountType(next);
    setErrors({});
    router.replace(next === 'b2c' ? '/register?type=b2c' : '/register?type=b2b');
  }
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isOrg = accountType === 'b2b';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setErrorCode(null);

    if (isOrg) {
      const normalizedPhone = phone.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
      const result = orgRegisterSchema.safeParse({
        fullName,
        email,
        companyName,
        phone: normalizedPhone,
        password,
        confirmPassword,
      });
      if (!result.success) {
        const fieldErrors: FormErrors = {};
        result.error.issues.forEach((issue) => {
          const field = issue.path[0] as keyof FormErrors;
          if (!fieldErrors[field]) fieldErrors[field] = issue.message;
        });
        setErrors(fieldErrors);
        return;
      }

      setIsLoading(true);
      try {
        await apiRequest<RegisterResponse>('/api/v1/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email, password, accountType: 'b2b' }),
          skipAuth: true,
        });
        const draft: OrgRegisterDraft = {
          contactName: fullName.trim(),
          companyName: companyName.trim(),
          phone: normalizedPhone,
        };
        localStorage.setItem(registerDraftStorageKey(email), JSON.stringify(draft));
        setSuccess(true);
      } catch (err) {
        if (err instanceof ApiError) {
          setErrorCode(err.code ?? null);
          setErrors({ general: err.message });
        } else {
          setErrors({ general: 'An unexpected error occurred. Please try again.' });
        }
      } finally {
        setIsLoading(false);
      }
      return;
    }

    const result = individualRegisterSchema.safeParse({ email, password, confirmPassword });
    if (!result.success) {
      const fieldErrors: FormErrors = {};
      result.error.issues.forEach((issue) => {
        const field = issue.path[0] as keyof FormErrors;
        if (!fieldErrors[field]) fieldErrors[field] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setIsLoading(true);
    try {
      await apiRequest<RegisterResponse>('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, accountType: 'b2c' }),
        skipAuth: true,
      });
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorCode(err.code ?? null);
        setErrors({ general: err.message });
      } else {
        setErrors({ general: 'An unexpected error occurred. Please try again.' });
      }
    } finally {
      setIsLoading(false);
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4">
        <div className="w-full max-w-md rounded-xl border border-gray-800 bg-[#0a0a0a] p-10 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-green-900/40">
            <svg className="h-7 w-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="mb-3 text-xl font-semibold text-white">Check your email</h2>
          <p className="text-sm leading-relaxed text-gray-400">
            We&apos;ve sent a verification link to{' '}
            <span className="font-medium text-white">{email}</span>.
          </p>
          <p className="mt-3 text-xs text-gray-500">
            Account type: {isOrg ? 'Organization' : 'Individual'}
          </p>
          <p className="mt-4 text-xs text-gray-500">The link expires in 24 hours.</p>
          <Link href="/login" className={`mt-6 inline-block text-sm ${LINK_ACCENT}`}>
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh overflow-hidden bg-black text-white lg:grid lg:grid-cols-[minmax(0,42%)_minmax(0,58%)]">
      <div className="flex h-dvh flex-col items-center justify-center overflow-hidden bg-black px-4 sm:px-8 lg:px-10">
        <div className="mx-auto flex h-[90%] w-[90%] max-w-[420px] flex-col justify-center">
          <div className="mb-3 shrink-0 text-center">
            <Link href="/" className="mb-3 inline-flex justify-center">
              <Image
                src="/images/racko-logo.png"
                alt="Racko"
                width={140}
                height={38}
                priority
                className="h-8 w-auto"
              />
            </Link>

            <h1 className="text-xl font-bold leading-tight tracking-tight sm:text-2xl">
              Create your account
            </h1>
            <p className="mt-1 text-xs text-gray-400 sm:text-sm">
              Start deploying in minutes. No credit card required.
            </p>
          </div>

          <div className="mb-3 grid shrink-0 grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => selectAccountType('b2c')}
              className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition sm:text-sm ${
                !isOrg
                  ? 'border-[#B91C1C] bg-red-950/40 text-white'
                  : 'border-gray-700 text-gray-400 hover:border-gray-600'
              }`}
            >
              <UserRound className="h-3.5 w-3.5" />
              Individual
            </button>
            <button
              type="button"
              onClick={() => selectAccountType('b2b')}
              className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition sm:text-sm ${
                isOrg
                  ? 'border-[#B91C1C] bg-red-950/40 text-white'
                  : 'border-gray-700 text-gray-400 hover:border-gray-600'
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              Organization
            </button>
          </div>

          <form
            onSubmit={handleSubmit}
            noValidate
            className="min-h-0 flex-1 space-y-2 overflow-y-auto"
          >
            {isOrg ? (
              <>
                <Field
                  label="Full Name"
                  icon={<User className="h-4 w-4" />}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Name"
                  autoComplete="name"
                  disabled={isLoading}
                  error={errors.fullName}
                />
                <Field
                  label="Work Email"
                  icon={<Mail className="h-4 w-4" />}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@gmail.com"
                  autoComplete="email"
                  disabled={isLoading}
                  error={errors.email}
                />
                <Field
                  label="Company Name"
                  icon={<Building2 className="h-4 w-4" />}
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="abc tech"
                  autoComplete="organization"
                  disabled={isLoading}
                  error={errors.companyName}
                />
                <Field
                  label="Phone No."
                  icon={<Phone className="h-4 w-4" />}
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91-XXXXXXXXXX"
                  autoComplete="tel"
                  disabled={isLoading}
                  error={errors.phone}
                />
              </>
            ) : (
              <Field
                label="Work Email"
                icon={<Mail className="h-4 w-4" />}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@gmail.com"
                autoComplete="email"
                disabled={isLoading}
                error={errors.email}
              />
            )}

            <Field
              label="Password"
              icon={<KeyRound className="h-4 w-4" />}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="**************"
              autoComplete="new-password"
              disabled={isLoading}
              error={errors.password}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-gray-400 hover:text-white"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
            />
            <Field
              label="Confirm Password"
              icon={<KeyRound className="h-4 w-4" />}
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="**************"
              autoComplete="new-password"
              disabled={isLoading}
              error={errors.confirmPassword}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="text-gray-400 hover:text-white"
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
            />

            {errors.general ? (
              <div className="rounded-lg border border-red-700 bg-red-900/30 px-3 py-2 text-xs text-red-300">
                <p>{errors.general}</p>
                {errorCode === 'REGISTRATION_UNAVAILABLE' ? (
                  <Link href="/login" className={`mt-1 inline-block text-[11px] ${LINK_ACCENT}`}>
                    Sign in instead
                  </Link>
                ) : null}
              </div>
            ) : null}

            <p className="pt-0.5 text-center text-sm text-gray-400">
              Already have an account?{' '}
              <Link href="/login" className={LINK_ACCENT}>
                Login here
              </Link>
            </p>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-[#B91C1C] py-2 text-sm font-semibold text-white transition hover:bg-[#DC2626] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading
                ? 'Creating account...'
                : isOrg
                  ? 'Create Organization Account'
                  : 'Create Individual Account'}
            </button>
          </form>
        </div>
      </div>

      <HeroPanel />
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
          Loading...
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
