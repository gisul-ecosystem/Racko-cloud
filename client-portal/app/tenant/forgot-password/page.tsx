'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TenantAuthFrame } from '@/components/tenant/TenantAuthFrame';
import {
  TENANT_AUTH_BTN,
  TENANT_AUTH_ERROR_BOX,
  TENANT_AUTH_INPUT,
  TENANT_AUTH_LINK,
} from '@/components/tenant/tenantAuthStyles';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { tenantForgotPassword } from '@/lib/tenantPortalApi';
import { ApiError } from '@/lib/apiClient';

export default function TenantForgotPasswordPage() {
  const { accentColor, tenantNotFound, loading: brandingLoading } = useTenantBranding();
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
        setError('Tenant not found');
      } else {
        setSent(true);
      }
    } finally {
      setIsLoading(false);
    }
  }

  const formDisabled = brandingLoading || tenantNotFound || isLoading;

  return (
    <TenantAuthFrame
      eyebrow="PASSWORD"
      title="Reset your password"
      description="Enter your work email and we'll send a reset link if an account exists."
    >
      {sent ? (
        <p className="text-sm text-gray-600">
          If an account exists for that email, a reset link has been sent.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
            {isLoading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-gray-500">
        <Link href="/tenant/login" className={TENANT_AUTH_LINK}>
          Back to sign in
        </Link>
      </p>
    </TenantAuthFrame>
  );
}
