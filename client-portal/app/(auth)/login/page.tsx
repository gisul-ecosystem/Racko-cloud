'use client';

import { useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { AlertCircle, MailWarning } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { ApiError } from '../../../lib/apiClient';
import { apiRequest } from '../../../lib/apiClient';
import { AuthBrand } from '../../../components/auth/AuthBrand';

const INPUT_CLASS =
  'w-full bg-[#1f2937] border rounded-lg px-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#B91C1C] transition';
const BTN_PRIMARY =
  'w-full bg-[#B91C1C] hover:bg-[#DC2626] disabled:bg-[#B91C1C]/50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition focus:outline-none focus:ring-2 focus:ring-[#B91C1C] focus:ring-offset-2 focus:ring-offset-[#111827]';
const LINK_ACCENT = 'text-[#DC2626] hover:text-[#B91C1C] font-medium';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type FormErrors = Partial<Record<'email' | 'password' | 'general', string>>;

interface ResendResponse {
  message: string;
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

    // Client-side validation
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
          // Extract unlock time from message if present
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
    <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <AuthBrand />

        <div className="bg-[#111827] border border-gray-800 rounded-xl p-8">
          <h1 className="text-xl font-semibold text-white mb-6">Sign in to your account</h1>

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1.5">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`${INPUT_CLASS} ${errors.email ? 'border-red-500' : 'border-gray-700'}`}
                placeholder="you@company.com"
                disabled={isLoading}
              />
              {errors.email && (
                <p className="text-red-400 text-xs mt-1">{errors.email}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-gray-300">
                  Password
                </label>
                <Link href="/forgot-password" className="text-xs text-[#DC2626] hover:text-[#B91C1C]">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${INPUT_CLASS} pr-10 ${errors.password ? 'border-red-500' : 'border-gray-700'}`}
                  placeholder="••••••••"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 text-xs"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {errors.password && (
                <p className="text-red-400 text-xs mt-1">{errors.password}</p>
              )}
            </div>

            {/* General error */}
            {errors.general && (
              <div className={`rounded-lg px-4 py-3 text-sm ${
                errorCode === 'ACCOUNT_LOCKED'
                  ? 'bg-purple-900/30 border border-purple-700 text-purple-300'
                  : errorCode === 'EMAIL_NOT_VERIFIED' || errorCode === 'PASSWORD_SETUP_REQUIRED'
                  ? 'bg-yellow-900/30 border border-yellow-700 text-yellow-300'
                  : 'bg-red-900/30 border border-red-700 text-red-300'
              }`}>
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
                {errorCode === 'ACCOUNT_LOCKED' && lockedUntil && (
                  <p className="text-xs mt-1 text-purple-400">Auto-unlocks at {lockedUntil}</p>
                )}
                {errorCode === 'EMAIL_NOT_VERIFIED' && (
                  <div className="mt-2">
                    {resendState === 'sent' ? (
                      <p className="text-xs text-green-400">{resendMessage}</p>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={handleResendVerification}
                          disabled={resendState === 'sending'}
                          className="text-xs text-yellow-400 underline hover:text-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {resendState === 'sending'
                            ? 'Sending...'
                            : resendState === 'failed'
                            ? 'Try again'
                            : 'Resend verification email'}
                        </button>
                        {resendState === 'failed' && resendMessage && (
                          <p className="text-xs text-red-400 mt-1">{resendMessage}</p>
                        )}
                      </>
                    )}
                  </div>
                )}
                {errorCode === 'PASSWORD_SETUP_REQUIRED' && (
                  <div className="mt-2">
                    <Link href="/forgot-password" className="text-xs text-yellow-200 underline">
                      Need a fresh password setup link?
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className={BTN_PRIMARY}
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-400 mt-6">
            Don&apos;t have an account?{' '}
            <Link href="/register" className={LINK_ACCENT}>Register</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
