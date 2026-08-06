'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { TenantAuthFrame } from '@/components/tenant/TenantAuthFrame';
import {
  TENANT_AUTH_BTN,
  TENANT_AUTH_ERROR_BOX,
  TENANT_AUTH_INPUT,
  TENANT_AUTH_LINK,
} from '@/components/tenant/tenantAuthStyles';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { tenantResendVerification, tenantVerifyEmail } from '@/lib/tenantPortalApi';
import { ApiError } from '@/lib/apiClient';

type VerifyState = 'loading' | 'success' | 'error';

function VerifyEmailForm() {
  const router = useRouter();
  const { accentColor, tenantNotFound, loading: brandingLoading } = useTenantBranding();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [state, setState] = useState<VerifyState>('loading');
  const [message, setMessage] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState('error');
      setMessage('No verification token found. Please check your email link.');
      return;
    }

    let cancelled = false;

    async function verify() {
      try {
        const res = await tenantVerifyEmail(token);
        if (cancelled) return;

        if (res.requiresPasswordSetup && res.resetToken) {
          router.replace(
            `/console/reset-password?token=${encodeURIComponent(res.resetToken)}`
          );
          return;
        }

        setState('success');
        setMessage(res.message);
      } catch (err) {
        if (!cancelled) {
          setState('error');
          setMessage(
            err instanceof ApiError ? err.message : 'Verification failed. Please try again.'
          );
        }
      }
    }

    void verify();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    if (!resendEmail.trim()) {
      setResendState('failed');
      setResendMessage('Enter your email address.');
      return;
    }
    setResendState('sending');
    setResendMessage(null);
    try {
      await tenantResendVerification(resendEmail.trim());
      setResendState('sent');
      setResendMessage('If an account needs verification, a new link has been sent.');
    } catch (err) {
      setResendState('failed');
      setResendMessage(err instanceof ApiError ? err.message : 'Could not resend verification.');
    }
  }

  if (brandingLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <>
      {state === 'loading' && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          <p className="text-sm text-gray-600">Verifying your email…</p>
        </div>
      )}

      {state === 'success' && (
        <div className="space-y-4 text-center">
          <p className="text-sm text-green-700">{message}</p>
          <Link
            href="/console/login"
            className={`${TENANT_AUTH_BTN} inline-flex items-center justify-center`}
            style={{ backgroundColor: accentColor }}
          >
            Continue to sign in
          </Link>
        </div>
      )}

      {state === 'error' && (
        <div className="space-y-5">
          <div className={TENANT_AUTH_ERROR_BOX}>
            <p className="font-semibold">Verification failed</p>
            <p className="mt-0.5">{message}</p>
          </div>

          {!tenantNotFound ? (
            <form onSubmit={(e) => void handleResend(e)} className="space-y-3">
              <p className="text-sm text-gray-600">
                Request a new verification link with the email used for your invite.
              </p>
              <input
                type="email"
                required
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                placeholder="you@company.com"
                className={TENANT_AUTH_INPUT}
                disabled={resendState === 'sending'}
              />
              {resendState === 'sent' && resendMessage ? (
                <p className="text-sm text-green-700">{resendMessage}</p>
              ) : null}
              {resendState === 'failed' && resendMessage ? (
                <p className="text-sm text-red-600">{resendMessage}</p>
              ) : null}
              <button
                type="submit"
                disabled={resendState === 'sending'}
                className={TENANT_AUTH_BTN}
                style={{ backgroundColor: accentColor }}
              >
                {resendState === 'sending' ? 'Sending…' : 'Resend verification email'}
              </button>
            </form>
          ) : null}

          <p className="text-center text-sm text-gray-500">
            <Link href="/console/login" className={TENANT_AUTH_LINK}>
              Back to sign in
            </Link>
          </p>
        </div>
      )}
    </>
  );
}

export default function TenantVerifyEmailPage() {
  return (
    <TenantAuthFrame
      eyebrow="VERIFY"
      title="Verify your email"
      description="Confirm your invite — you'll set a password next if this is a new account."
    >
      <Suspense
        fallback={
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        }
      >
        <VerifyEmailForm />
      </Suspense>
    </TenantAuthFrame>
  );
}
