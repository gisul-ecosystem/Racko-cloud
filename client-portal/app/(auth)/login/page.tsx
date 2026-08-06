'use client';

import { useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { z } from 'zod';
import { AlertCircle, Eye, EyeOff, KeyRound, Mail, MailWarning } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { ApiError, apiRequest } from '../../../lib/apiClient';

const LINK_ACCENT = 'text-[#EF4444] hover:text-[#DC2626] font-medium';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type FormErrors = Partial<Record<'email' | 'password' | 'general', string>>;

interface ResendResponse {
  message: string;
}

function Field({
  label,
  icon,
  error,
  trailing,
  labelTrailing,
  ...props
}: {
  label: string;
  icon: ReactNode;
  error?: string;
  trailing?: ReactNode;
  labelTrailing?: ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="block text-[13px] font-medium text-gray-400">{label}</label>
        {labelTrailing}
      </div>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
          {icon}
        </span>
        <input
          {...props}
          className={`w-full rounded-lg border border-gray-700 bg-black py-2 pl-10 text-sm text-white placeholder-gray-500 transition focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C] disabled:opacity-60 ${
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

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setErrorCode(null);

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: FormErrors = {};
      result.error.issues.forEach((issue) => {
        const field = issue.path[0] as keyof FormErrors;
        fieldErrors[field] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setIsLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorCode(err.code ?? null);
        if (err.code === 'ACCOUNT_LOCKED') {
          const match = err.message.match(/(\d+) minute/);
          if (match) {
            const unlockDate = new Date(Date.now() + parseInt(match[1]) * 60000);
            setLockedUntil(unlockDate.toLocaleTimeString());
          }
          setErrors({ general: err.message });
        } else if (err.code === 'EMAIL_NOT_VERIFIED' || err.code === 'PASSWORD_SETUP_REQUIRED') {
          setErrors({ general: err.message });
        } else {
          setErrors({ general: err.message });
        }
      } else {
        setErrors({ general: 'An unexpected error occurred. Please try again.' });
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResendVerification() {
    if (!email) {
      setErrors({ general: 'Enter your email address first.' });
      return;
    }
    setResendState('sending');
    setResendMessage(null);
    try {
      const response = await apiRequest<ResendResponse>('/api/v1/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email }),
        skipAuth: true,
      });
      setResendState('sent');
      setResendMessage(response?.message ?? 'Verification email sent. Check your inbox.');
    } catch (err) {
      setResendState('failed');
      setResendMessage(
        err instanceof ApiError
          ? err.message
          : 'Could not send the verification email. Please try again in a moment.'
      );
    }
  }

  return (
    <div className="h-dvh overflow-hidden bg-black text-white lg:grid lg:grid-cols-[minmax(0,42%)_minmax(0,58%)]">
      <div className="flex h-dvh flex-col justify-center overflow-hidden bg-black px-6 py-5 sm:px-10 lg:px-12 xl:px-16">
        <div className="mx-auto w-full max-w-[380px]">
          <div className="mb-4 text-center">
            <Link href="/" className="mb-4 inline-flex justify-center">
              <Image
                src="/images/racko-logo.png"
                alt="Racko"
                width={160}
                height={44}
                priority
                className="h-10 w-auto"
              />
            </Link>

            <h1 className="text-[26px] font-bold leading-tight tracking-tight">
              Sign in to your account
            </h1>
            <p className="mt-1.5 text-sm text-gray-400">
              Welcome back. Continue where you left off.
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-3">
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
              label="Password"
              icon={<KeyRound className="h-4 w-4" />}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="**************"
              autoComplete="current-password"
              disabled={isLoading}
              error={errors.password}
              labelTrailing={
                <Link href="/forgot-password" className="text-xs text-[#EF4444] hover:text-[#DC2626]">
                  Forgot password?
                </Link>
              }
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

            {errors.general ? (
              <div
                className={`rounded-lg px-3 py-2 text-xs ${
                  errorCode === 'ACCOUNT_LOCKED'
                    ? 'border border-purple-700 bg-purple-900/30 text-purple-300'
                    : errorCode === 'EMAIL_NOT_VERIFIED' || errorCode === 'PASSWORD_SETUP_REQUIRED'
                      ? 'border border-yellow-700 bg-yellow-900/30 text-yellow-300'
                      : 'border border-red-700 bg-red-900/30 text-red-300'
                }`}
              >
                <div className="flex items-start gap-2">
                  {errorCode === 'EMAIL_NOT_VERIFIED' ? (
                    <MailWarning className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <div>
                    {errorCode === 'EMAIL_NOT_VERIFIED' ? (
                      <p className="mb-1 font-semibold">Email verification required</p>
                    ) : null}
                    <p>{errors.general}</p>
                  </div>
                </div>
                {errorCode === 'ACCOUNT_LOCKED' && lockedUntil ? (
                  <p className="mt-1 text-[11px] text-purple-400">Auto-unlocks at {lockedUntil}</p>
                ) : null}
                {errorCode === 'EMAIL_NOT_VERIFIED' ? (
                  <div className="mt-2">
                    {resendState === 'sent' ? (
                      <p className="text-[11px] text-green-400">{resendMessage}</p>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={handleResendVerification}
                          disabled={resendState === 'sending'}
                          className="text-[11px] text-yellow-400 underline hover:text-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {resendState === 'sending'
                            ? 'Sending...'
                            : resendState === 'failed'
                              ? 'Try again'
                              : 'Resend verification email'}
                        </button>
                        {resendState === 'failed' && resendMessage ? (
                          <p className="mt-1 text-[11px] text-red-400">{resendMessage}</p>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : null}
                {errorCode === 'PASSWORD_SETUP_REQUIRED' ? (
                  <div className="mt-2">
                    <Link href="/forgot-password" className="text-[11px] text-yellow-200 underline">
                      Need a fresh password setup link?
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : null}

            <p className="pt-1 text-center text-sm text-gray-400">
              Don&apos;t have an account?{' '}
              <Link href="/register" className={LINK_ACCENT}>
                Register here
              </Link>
            </p>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-[#B91C1C] py-2.5 text-sm font-semibold text-white transition hover:bg-[#DC2626] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>

      <HeroPanel />
    </div>
  );
}
