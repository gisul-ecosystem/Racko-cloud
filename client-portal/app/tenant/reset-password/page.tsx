'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { AuthBrand } from '@/components/auth/AuthBrand';
import {
  TENANT_BTN_PRIMARY,
  TENANT_INPUT_CLASS,
  TENANT_LINK_ACCENT,
} from '@/components/tenant/tenantAuthStyles';
import { tenantResetPassword } from '@/lib/tenantPortalApi';
import { ApiError } from '@/lib/apiClient';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Reset token is missing. Use the link from your email.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      await tenantResetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reset failed.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-[#111827] p-8">
      <h1 className="mb-6 text-xl font-semibold text-white">Set new password</h1>

      {done ? (
        <p className="text-sm text-green-300">
          Password updated. You can sign in with your new password.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-300">
              New password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={TENANT_INPUT_CLASS}
              disabled={isLoading}
            />
          </div>
          <div>
            <label htmlFor="confirm" className="mb-1.5 block text-sm font-medium text-gray-300">
              Confirm password
            </label>
            <input
              id="confirm"
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={TENANT_INPUT_CLASS}
              disabled={isLoading}
            />
          </div>
          {error && (
            <div className="rounded-lg border border-red-700 bg-red-900/30 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}
          <button type="submit" disabled={isLoading} className={TENANT_BTN_PRIMARY}>
            {isLoading ? 'Updating...' : 'Update password'}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-gray-400">
        <Link href="/tenant/login" className={TENANT_LINK_ACCENT}>
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

export default function TenantResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0f1e] px-4">
      <div className="w-full max-w-md">
        <AuthBrand />
        <Suspense
          fallback={
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
            </div>
          }
        >
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
