'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiRequest, ApiError } from '../../lib/apiClient';

type VerifyState = 'loading' | 'success' | 'error';

interface VerifyResponse {
  message: string;
}

export default function VerifyEmailPage() {
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
        if (!cancelled) {
          setState('success');
          setMessage(res.message);
        }
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

    verify();
    return () => { cancelled = true; };
  }, [token]);

  async function handleResend() {
    // Trigger re-registration flow to get a new verification email
    // The register endpoint is idempotent for unverified accounts
    setResendSent(true);
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-2xl font-bold text-blue-400 tracking-tight">CloudPlatform</span>
        </div>

        <div className="bg-[#111827] border border-gray-800 rounded-xl p-10 text-center">
          {state === 'loading' && (
            <>
              <div className="w-12 h-12 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-5" />
              <h2 className="text-lg font-semibold text-white mb-2">Verifying your email</h2>
              <p className="text-gray-400 text-sm">Please wait a moment...</p>
            </>
          )}

          {state === 'success' && (
            <>
              <div className="w-14 h-14 bg-green-900/40 rounded-full flex items-center justify-center mx-auto mb-5">
                <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-white mb-3">Email verified</h2>
              <p className="text-gray-400 text-sm mb-6">{message}</p>
              <Link
                href="/login"
                className="inline-block bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition"
              >
                Sign in to your account
              </Link>
            </>
          )}

          {state === 'error' && (
            <>
              <div className="w-14 h-14 bg-red-900/40 rounded-full flex items-center justify-center mx-auto mb-5">
                <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-white mb-3">Verification failed</h2>
              <p className="text-gray-400 text-sm mb-6">{message}</p>

              {!resendSent ? (
                <div className="space-y-3">
                  <button
                    onClick={handleResend}
                    className="w-full bg-gray-700 hover:bg-gray-600 text-white font-medium py-2.5 rounded-lg text-sm transition"
                  >
                    Request a new verification link
                  </button>
                  <Link
                    href="/login"
                    className="block text-blue-400 hover:text-blue-300 text-sm"
                  >
                    Back to sign in
                  </Link>
                </div>
              ) : (
                <div>
                  <p className="text-green-400 text-sm mb-4">
                    Please register again with your email to receive a new verification link.
                  </p>
                  <Link
                    href="/register"
                    className="inline-block bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition"
                  >
                    Go to registration
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
