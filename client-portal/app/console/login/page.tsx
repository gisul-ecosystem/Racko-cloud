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
import { tenantResendVerification } from '@/lib/tenantPortalApi';
import { getTenantDefaultDashboardPath } from '@/lib/tenantPortalRoutes';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export default function ConsoleTenantLoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, isLoading: authLoading, tenantUser } = useTenantAuth();
  const { accentColor, tenantNotFound, loading: brandingLoading } = useTenantBranding();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const tenantDevDomain = getTenantDevDomain();

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace(getTenantDefaultDashboardPath(tenantUser?.role, tenantUser));
    }
  }, [authLoading, isAuthenticated, router, tenantUser]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setErrorCode(null);
    setResendState('idle');
    setResendMessage(null);

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
        setErrorCode(err.code ?? null);
        if (err.message === 'TENANT_NOT_FOUND' || err.code === 'TENANT_NOT_FOUND') {
          setError('Tenant not found');
        } else if (err.message === 'INVALID_CREDENTIALS' || err.code === 'INVALID_CREDENTIALS') {
          setError('Incorrect email or password.');
        } else if (err.code === 'EMAIL_NOT_VERIFIED' || err.code === 'PASSWORD_SETUP_REQUIRED') {
          setError(err.message);
        } else if (err.code === 'ACCESS_WINDOW_DENIED' || err.status === 403) {
          const next =
            err.nextWindow != null
              ? ` Next available window: ${new Date(err.nextWindow).toLocaleString()}.`
              : '';
          setError(`${err.message}${next}`);
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

  async function handleResendVerification() {
    if (!email.trim()) {
      setResendMessage('Enter your email address first.');
      setResendState('failed');
      return;
    }
    setResendState('sending');
    setResendMessage(null);
    try {
      await tenantResendVerification(email.trim());
      setResendState('sent');
      setResendMessage('If an account needs verification, a new link has been sent.');
    } catch (err) {
      setResendState('failed');
      setResendMessage(err instanceof ApiError ? err.message : 'Could not resend verification.');
    }
  }

  const formDisabled = brandingLoading || tenantNotFound || isLoading;

  return (
    <TenantAuthFrame
      title="Welcome back"
      description="Use your work email after verifying your invite and setting your password. Sign in here for your tenant workspace — not at the platform /login."
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
            {errorCode === 'EMAIL_NOT_VERIFIED' ? (
              <div className="mt-3 space-y-2">
                {resendState === 'sent' ? (
                  <p className="text-sm text-green-700">{resendMessage}</p>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleResendVerification()}
                      disabled={resendState === 'sending'}
                      className="text-sm font-medium underline underline-offset-2"
                      style={{ color: accentColor }}
                    >
                      {resendState === 'sending'
                        ? 'Sending…'
                        : resendState === 'failed'
                          ? 'Retry resend'
                          : 'Resend verification email'}
                    </button>
                    {resendState === 'failed' && resendMessage ? (
                      <p className="text-xs text-red-600">{resendMessage}</p>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
            {errorCode === 'PASSWORD_SETUP_REQUIRED' ? (
              <p className="mt-2 text-sm text-gray-600">
                Open the “Set Your Password” link from your invite email, or use{' '}
                <Link href="/console/forgot-password" className={TENANT_AUTH_LINK}>
                  forgot password
                </Link>
                .
              </p>
            ) : null}
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
        <Link href="/console/forgot-password" className={TENANT_AUTH_LINK}>
          Forgot password?
        </Link>
      </p>
    </TenantAuthFrame>
  );
}
