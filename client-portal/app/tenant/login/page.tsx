'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { TenantAuthFrame } from '@/components/tenant/TenantAuthFrame';
import {
  TENANT_AUTH_BTN,
  TENANT_AUTH_ERROR_BOX,
  TENANT_AUTH_INPUT,
  TENANT_AUTH_LINK,
} from '@/components/tenant/tenantAuthStyles';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { ApiError } from '@/lib/apiClient';
import { getTenantDevDomain } from '@/lib/gatewayUrl';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export default function TenantLoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, isLoading: authLoading } = useTenantAuth();
  const { accentColor, tenantNotFound, loading: brandingLoading } = useTenantBranding();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tenantDevDomain = getTenantDevDomain();

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace('/tenant/dashboard/wallet');
    }
  }, [authLoading, isAuthenticated, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Invalid input');
      return;
    }

    setIsLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.message === 'TENANT_NOT_FOUND' || err.code === 'TENANT_NOT_FOUND') {
          setError('Tenant not found');
        } else if (err.message === 'INVALID_CREDENTIALS' || err.code === 'INVALID_CREDENTIALS') {
          setError('Incorrect email or password.');
        } else {
          setError(err.message);
        }
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  const formDisabled = brandingLoading || tenantNotFound || isLoading;

  return (
    <TenantAuthFrame
      title="Welcome back"
      description="Use your work email and the password your administrator gave you."
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={TENANT_AUTH_INPUT}
            placeholder="you@company.com"
            disabled={formDisabled}
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-700">
            Password <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${TENANT_AUTH_INPUT} pr-14`}
              placeholder="••••••••"
              disabled={formDisabled}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-500 hover:text-gray-800"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        {error && (
          <div className={TENANT_AUTH_ERROR_BOX}>
            <p className="font-semibold">Sign in failed</p>
            <p className="mt-0.5">{error}</p>
          </div>
        )}

        {tenantDevDomain && !tenantNotFound ? (
          <p className="text-xs text-gray-400">
            Dev mode: tenant domain <span className="font-mono">{tenantDevDomain}</span>
          </p>
        ) : null}

        <button
          type="submit"
          disabled={formDisabled}
          className={TENANT_AUTH_BTN}
          style={{ backgroundColor: tenantNotFound ? undefined : accentColor }}
        >
          {isLoading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-gray-500">
        <Link href="/tenant/forgot-password" className={TENANT_AUTH_LINK}>
          Forgot password?
        </Link>
      </p>
    </TenantAuthFrame>
  );
}
