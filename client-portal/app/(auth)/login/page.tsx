'use client';

import { useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { useAuth } from '../../../context/AuthContext';
import { ApiError } from '../../../lib/apiClient';
import { apiRequest } from '../../../lib/apiClient';

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
  const [resendSent, setResendSent] = useState(false);

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
        } else if (err.code === 'EMAIL_NOT_VERIFIED') {
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
    try {
      await apiRequest<ResendResponse>('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password: 'placeholder_not_used' }),
        skipAuth: true,
      });
    } catch {
      // Intentionally silent — same generic response
    }
    setResendSent(true);
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-2xl font-bold text-blue-400 tracking-tight">CloudPlatform</span>
          <p className="text-gray-400 text-sm mt-2">Enterprise Cloud Infrastructure</p>
        </div>

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
                className={`w-full bg-[#1f2937] border rounded-lg px-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
                  errors.email ? 'border-red-500' : 'border-gray-700'
                }`}
                placeholder="you@company.com"
                disabled={isLoading}
              />
              {errors.email && (
                <p className="text-red-400 text-xs mt-1">{errors.email}</p>
              )}
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
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full bg-[#1f2937] border rounded-lg px-4 py-2.5 pr-10 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
                    errors.password ? 'border-red-500' : 'border-gray-700'
                  }`}
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
                  : errorCode === 'EMAIL_NOT_VERIFIED'
                  ? 'bg-yellow-900/30 border border-yellow-700 text-yellow-300'
                  : 'bg-red-900/30 border border-red-700 text-red-300'
              }`}>
                <p>{errors.general}</p>
                {errorCode === 'ACCOUNT_LOCKED' && lockedUntil && (
                  <p className="text-xs mt-1 text-purple-400">Auto-unlocks at {lockedUntil}</p>
                )}
                {errorCode === 'EMAIL_NOT_VERIFIED' && (
                  <div className="mt-2">
                    {resendSent ? (
                      <p className="text-xs text-green-400">Verification email sent. Check your inbox.</p>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResendVerification}
                        className="text-xs text-yellow-400 underline hover:text-yellow-300"
                      >
                        Resend verification email
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-[#111827]"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-400 mt-6">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-blue-400 hover:text-blue-300 font-medium">
              Register as Admin
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
