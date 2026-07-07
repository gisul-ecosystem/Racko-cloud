'use client';

import { useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { apiRequest, ApiError } from '../../../lib/apiClient';
import { AuthBrand } from '../../../components/auth/AuthBrand';

const INPUT_CLASS =
  'w-full bg-[#1f2937] border rounded-lg px-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#B91C1C] transition';
const BTN_PRIMARY =
  'w-full bg-[#B91C1C] hover:bg-[#DC2626] disabled:bg-[#B91C1C]/50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition focus:outline-none focus:ring-2 focus:ring-[#B91C1C] focus:ring-offset-2 focus:ring-offset-[#111827]';
const LINK_ACCENT = 'text-[#DC2626] hover:text-[#B91C1C] font-medium';

const registerSchema = z
  .object({
    email: z.string().email('Invalid email address').max(254),
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Z]/, 'Must include an uppercase letter')
      .regex(/[a-z]/, 'Must include a lowercase letter')
      .regex(/[0-9]/, 'Must include a number')
      .regex(/[^A-Za-z0-9]/, 'Must include a special character'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type FormErrors = Partial<Record<'email' | 'password' | 'confirmPassword' | 'general', string>>;

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) return { score, label: 'Weak', color: 'bg-red-500' };
  if (score === 3) return { score, label: 'Fair', color: 'bg-yellow-500' };
  if (score === 4) return { score, label: 'Good', color: 'bg-blue-500' };
  return { score, label: 'Strong', color: 'bg-green-500' };
}

interface RegisterResponse {
  message: string;
}

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const strength = getPasswordStrength(password);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setErrorCode(null);

    const result = registerSchema.safeParse({ email, password, confirmPassword });
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
        body: JSON.stringify({ email, password }),
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
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-[#111827] border border-gray-800 rounded-xl p-10">
            <div className="w-14 h-14 bg-green-900/40 rounded-full flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white mb-3">Check your email</h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              We&apos;ve sent a verification link to{' '}
              <span className="text-white font-medium">{email}</span>.
            </p>
            <p className="text-gray-500 text-xs mt-4">The link expires in 24 hours.</p>
            <Link href="/login" className={`inline-block mt-6 text-sm ${LINK_ACCENT}`}>
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <AuthBrand />

        <div className="bg-[#111827] border border-gray-800 rounded-xl p-8">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-white">Create an account</h1>
            <p className="text-gray-400 text-sm mt-1">
              You are registering as an{' '}
              <span className="text-[#DC2626] font-medium">Admin</span>
            </p>
          </div>

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
              {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
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

              {/* Password strength indicator */}
              {password.length > 0 && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-all ${
                          i <= strength.score ? strength.color : 'bg-gray-700'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-gray-400">
                    Strength: <span className="text-white">{strength.label}</span>
                  </p>
                </div>
              )}

              {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password}</p>}
              <p className="text-gray-500 text-xs mt-1">
                Min 8 chars, uppercase, lowercase, number, special character
              </p>
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-1.5">
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`${INPUT_CLASS} ${errors.confirmPassword ? 'border-red-500' : 'border-gray-700'}`}
                placeholder="••••••••"
                disabled={isLoading}
              />
              {errors.confirmPassword && (
                <p className="text-red-400 text-xs mt-1">{errors.confirmPassword}</p>
              )}
            </div>

            {/* General error */}
            {errors.general && (
              <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-sm text-red-300">
                <p>{errors.general}</p>
                {errorCode === 'REGISTRATION_UNAVAILABLE' && (
                  <Link href="/login" className={`inline-block mt-2 text-xs ${LINK_ACCENT}`}>
                    Sign in instead
                  </Link>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className={BTN_PRIMARY}
            >
              {isLoading ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-400 mt-6">
            Already have an account?{' '}
            <Link href="/login" className={LINK_ACCENT}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
