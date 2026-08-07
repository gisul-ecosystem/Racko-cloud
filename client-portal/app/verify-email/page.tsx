'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { apiRequest, ApiError } from '../../lib/apiClient';
import { AuthBrand } from '../../components/auth/AuthBrand';

type VerifyState = 'loading' | 'success' | 'error' | 'redirecting';

interface VerifyResponse {
  success: boolean;
  message: string;
  data?: {
    requiresPasswordSetup?: boolean;
    resetToken?: string;
  };
}

const BTN_PRIMARY =
  'inline-flex items-center justify-center rounded-lg bg-[#B91C1C] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#DC2626] focus:outline-none focus:ring-2 focus:ring-[#B91C1C] focus:ring-offset-2 focus:ring-offset-[#111827]';
const BTN_SECONDARY =
  'w-full rounded-lg border border-gray-700 bg-[#1f2937] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-[#B91C1C] focus:ring-offset-2 focus:ring-offset-[#111827]';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [state, setState] = useState<VerifyState>('loading');
  const [message, setMessage] = useState('');
  const [resendSent, setResendSent] = useState(false);

  useEffect(() => {
    if (!token) {
      setState('error');
      setMessage('No verification token found. Please check your email link.');
      return;
    }

    let cancelled = false;

    async function verify() {
      try {
        const res = await apiRequest<VerifyResponse>('/api/v1/auth/verify-email', {
          method: 'POST',
          body: JSON.stringify({ token }),
          skipAuth: true,
        });
        if (cancelled) return;

        if (res.data?.requiresPasswordSetup && res.data.resetToken) {
          setState('redirecting');
          setMessage('Email verified. Redirecting to set your password…');
          router.replace(
            `/reset-password?token=${encodeURIComponent(res.data.resetToken)}&setup=1`
          );
          return;
        }

        setState('success');
        setMessage(res.message);
      } catch (err) {
        if (!cancelled) {
          setState('error');
          if (err instanceof ApiError) {
            setMessage(err.message);
          } else {
            setMessage('Verification failed. Please try again.');
          }
        }
      }
    }

    void verify();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  function handleResend() {
    setResendSent(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0f1e] px-4">
      <div className="w-full max-w-md">
        <AuthBrand />

        <div className="rounded-xl border border-gray-800 bg-[#111827] p-8 text-center shadow-sm">
          {state === 'loading' || state === 'redirecting' ? (
            <>
              <Loader2 className="mx-auto mb-5 h-10 w-10 animate-spin text-[#B91C1C]" />
              <h1 className="mb-2 text-lg font-semibold text-white">
                {state === 'redirecting' ? 'Email verified' : 'Verifying your email'}
              </h1>
              <p className="text-sm text-gray-400">
                {state === 'redirecting'
                  ? message || 'Redirecting to set your password…'
                  : 'Please wait a moment…'}
              </p>
            </>
          ) : null}

          {state === 'success' ? (
            <>
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-green-700 bg-green-900/30">
                <CheckCircle2 className="h-7 w-7 text-green-400" />
              </div>
              <h1 className="mb-3 text-xl font-semibold text-white">Email verified</h1>
              <p className="mb-6 text-sm text-gray-400">{message}</p>
              <Link href="/login" className={BTN_PRIMARY}>
                Sign in to Racko
              </Link>
            </>
          ) : null}

          {state === 'error' ? (
            <>
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-red-700 bg-red-900/30">
                <XCircle className="h-7 w-7 text-red-400" />
              </div>
              <h1 className="mb-3 text-xl font-semibold text-white">Verification failed</h1>
              <p className="mb-6 text-sm text-gray-400">{message}</p>

              {!resendSent ? (
                <div className="space-y-3">
                  <button type="button" onClick={handleResend} className={BTN_SECONDARY}>
                    Request a new verification link
                  </button>
                  <Link
                    href="/login"
                    className="block text-sm font-medium text-[#DC2626] hover:text-[#B91C1C]"
                  >
                    Back to sign in
                  </Link>
                </div>
              ) : (
                <div>
                  <p className="mb-4 text-sm text-green-400">
                    Please register again with your email to receive a new verification link.
                  </p>
                  <Link href="/register" className={BTN_PRIMARY}>
                    Go to registration
                  </Link>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#0a0f1e] px-4">
          <Loader2 className="h-10 w-10 animate-spin text-[#B91C1C]" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
