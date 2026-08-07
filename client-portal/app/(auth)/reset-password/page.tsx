'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { apiRequest, ApiError } from '../../../lib/apiClient';
import { AuthBrand } from '../../../components/auth/AuthBrand';

const INPUT_CLASS =
  'w-full bg-[#1f2937] border rounded-lg px-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#B91C1C] transition';
const BTN_PRIMARY =
  'w-full bg-[#B91C1C] hover:bg-[#DC2626] disabled:bg-[#B91C1C]/50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition focus:outline-none focus:ring-2 focus:ring-[#B91C1C] focus:ring-offset-2 focus:ring-offset-[#111827]';

const passwordSchema = z
  .string()
  .min(8, 'At least 8 characters')
  .regex(/[A-Z]/, 'One uppercase letter required')
  .regex(/[a-z]/, 'One lowercase letter required')
  .regex(/[0-9]/, 'One number required')
  .regex(/[^A-Za-z0-9]/, 'One special character required');

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const isFirstTimeSetup = searchParams.get('setup') === '1';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirm?: string }>({});

  useEffect(() => {
    if (!token) {
      setError('Invalid or missing reset token. Please request a new password reset link.');
    }
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    const passwordResult = passwordSchema.safeParse(password);
    if (!passwordResult.success) {
      setFieldErrors({ password: passwordResult.error.issues[0]?.message });
      return;
    }
    if (password !== confirm) {
      setFieldErrors({ confirm: 'Passwords do not match.' });
      return;
    }

    setLoading(true);
    try {
      await apiRequest('/api/v1/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
        skipAuth: true,
      });
      setSuccess(true);
      setTimeout(() => router.push('/login'), 3000);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Something went wrong. Please try again or request a new reset link.');
      }
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="text-center">
        <p className="text-sm text-red-400 mb-4">{error}</p>
        <Link href="/forgot-password" className="text-sm text-[#DC2626] hover:text-[#B91C1C] font-medium">
          Request a new reset link
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-green-700 bg-green-900/30">
          <svg className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="mb-3 text-xl font-semibold text-white">
          {isFirstTimeSetup ? 'Password set' : 'Password reset'}
        </h2>
        <p className="mb-2 text-sm text-gray-400">
          {isFirstTimeSetup
            ? 'Your account is ready. Redirecting you to sign in…'
            : 'Your password has been updated successfully.'}
        </p>
        <p className="mb-6 text-xs text-gray-500">Redirecting to sign in...</p>
        <Link href="/login" className="text-sm font-medium text-[#DC2626] hover:text-[#B91C1C]">
          Sign in now
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="mb-2 text-xl font-semibold text-white">
        {isFirstTimeSetup ? 'Create your password' : 'Set a new password'}
      </h1>
      <p className="mb-6 text-sm text-gray-400">
        {isFirstTimeSetup
          ? 'Choose a strong password to finish setting up your Racko account.'
          : 'Choose a strong password for your account.'}
      </p>
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-300">
            {isFirstTimeSetup ? 'Password' : 'New password'}
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${INPUT_CLASS} pr-10 ${fieldErrors.password ? 'border-red-500' : 'border-gray-700'}`}
              placeholder="••••••••"
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-200"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          {fieldErrors.password && <p className="mt-1 text-xs text-red-400">{fieldErrors.password}</p>}
        </div>
        <div>
          <label htmlFor="confirm" className="mb-1.5 block text-sm font-medium text-gray-300">
            {isFirstTimeSetup ? 'Confirm password' : 'Confirm new password'}
          </label>
          <input
            id="confirm"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={`${INPUT_CLASS} ${fieldErrors.confirm ? 'border-red-500' : 'border-gray-700'}`}
            placeholder="••••••••"
            disabled={loading}
          />
          {fieldErrors.confirm && <p className="mt-1 text-xs text-red-400">{fieldErrors.confirm}</p>}
        </div>
        {error && (
          <div className="rounded-lg border border-red-700 bg-red-900/30 px-4 py-3 text-sm text-red-300">
            {error}
            {error.includes('expired') && (
              <div className="mt-2">
                <Link href="/forgot-password" className="text-xs text-red-400 underline hover:text-red-300">
                  Request a new reset link
                </Link>
              </div>
            )}
          </div>
        )}
        <button type="submit" disabled={loading} className={BTN_PRIMARY}>
          {loading
            ? isFirstTimeSetup
              ? 'Saving…'
              : 'Resetting...'
            : isFirstTimeSetup
              ? 'Create password'
              : 'Reset password'}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <AuthBrand />
        <div className="bg-[#111827] border border-gray-800 rounded-xl p-8">
          <Suspense fallback={<div className="text-center text-gray-400 text-sm">Loading...</div>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
