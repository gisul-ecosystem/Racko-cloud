'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { TenantAuthFrame } from '@/components/tenant/TenantAuthFrame';
import {
  TENANT_AUTH_BTN,
  TENANT_AUTH_ERROR_BOX,
  TENANT_AUTH_INPUT,
  TENANT_AUTH_LINK,
} from '@/components/tenant/tenantAuthStyles';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { tenantResetPassword } from '@/lib/tenantPortalApi';
import { ApiError } from '@/lib/apiClient';

function ResetPasswordForm() {
  const { accentColor, tenantNotFound, loading: brandingLoading } = useTenantBranding();
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

  const formDisabled = brandingLoading || tenantNotFound || isLoading;

  return (
    <>
      {done ? (
        <p className="text-sm text-green-700">
          Password updated. After verifying your email (if you haven&apos;t yet), you can sign in
          with your new password.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-700">
              New password <span className="text-red-500">*</span>
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={TENANT_AUTH_INPUT}
              disabled={formDisabled}
            />
          </div>
          <div>
            <label htmlFor="confirm" className="mb-1.5 block text-sm font-medium text-gray-700">
              Confirm password <span className="text-red-500">*</span>
            </label>
            <input
              id="confirm"
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={TENANT_AUTH_INPUT}
              disabled={formDisabled}
            />
          </div>
          {error && <div className={TENANT_AUTH_ERROR_BOX}>{error}</div>}
          <button
            type="submit"
            disabled={formDisabled}
            className={TENANT_AUTH_BTN}
            style={{ backgroundColor: accentColor }}
          >
            {isLoading ? 'Updating…' : 'Update password'}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-gray-500">
        <Link href="/console/login" className={TENANT_AUTH_LINK}>
          Back to sign in
        </Link>
      </p>
    </>
  );
}

export default function TenantResetPasswordPage() {
  return (
    <TenantAuthFrame
      eyebrow="PASSWORD"
      title="Set new password"
      description="Choose a strong password for your tenant account."
    >
      <Suspense
        fallback={
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </TenantAuthFrame>
  );
}
