'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AuthBrand } from '@/components/auth/AuthBrand';
import {
  TENANT_BTN_PRIMARY,
  TENANT_INPUT_CLASS,
  TENANT_LINK_ACCENT,
} from '@/components/tenant/tenantAuthStyles';
import { tenantForgotPassword } from '@/lib/tenantPortalApi';
import { ApiError } from '@/lib/apiClient';

export default function TenantForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await tenantForgotPassword(email.trim().toLowerCase());
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError && err.message === 'TENANT_NOT_FOUND') {
        setError('This domain is not recognized as an active tenant.');
      } else {
        setSent(true);
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0f1e] px-4">
      <div className="w-full max-w-md">
        <AuthBrand />
        <div className="rounded-xl border border-gray-800 bg-[#111827] p-8">
          <h1 className="mb-6 text-xl font-semibold text-white">Reset password</h1>

          {sent ? (
            <p className="text-sm text-gray-300">
              If an account exists for that email, a reset link has been sent.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-300">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
                {isLoading ? 'Sending...' : 'Send reset link'}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-gray-400">
            <Link href="/tenant/login" className={TENANT_LINK_ACCENT}>
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
