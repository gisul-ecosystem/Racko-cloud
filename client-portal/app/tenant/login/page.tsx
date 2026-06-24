'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { AuthBrand } from '@/components/auth/AuthBrand';
import {
  TENANT_BTN_PRIMARY,
  TENANT_INPUT_CLASS,
  TENANT_LINK_ACCENT,
} from '@/components/tenant/tenantAuthStyles';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { ApiError } from '@/lib/apiClient';
import { getTenantDevDomain } from '@/lib/gatewayUrl';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export default function TenantLoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, isLoading: authLoading } = useTenantAuth();
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
        if (err.message === 'TENANT_NOT_FOUND') {
          setError('This domain is not recognized as an active tenant.');
        } else if (err.message === 'INVALID_CREDENTIALS') {
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0f1e] px-4">
      <div className="w-full max-w-md">
        <AuthBrand />

        <div className="rounded-xl border border-gray-800 bg-[#111827] p-8">
          <h1 className="mb-2 text-xl font-semibold text-white">Tenant sign in</h1>
          <p className="mb-6 text-sm text-gray-400">
            {tenantDevDomain
              ? `Local dev: signing in as tenant domain ${tenantDevDomain}`
              : "Sign in on your organization's domain (e.g. labs.acme.com)"}
          </p>

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-300">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={TENANT_INPUT_CLASS}
                placeholder="admin@yourcompany.com"
                disabled={isLoading}
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-300">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${TENANT_INPUT_CLASS} pr-10`}
                  placeholder="••••••••"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-200"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-red-700 bg-red-900/30 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <button type="submit" disabled={isLoading} className={TENANT_BTN_PRIMARY}>
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-gray-400">
            <Link href="/tenant/forgot-password" className={TENANT_LINK_ACCENT}>
              Forgot password?
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
