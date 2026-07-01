'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiRequest } from '../../../lib/apiClient';
import { AuthBrand } from '../../../components/auth/AuthBrand';

const INPUT_CLASS =
  'w-full bg-[#1f2937] border rounded-lg px-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#B91C1C] transition';
const BTN_PRIMARY =
  'w-full bg-[#B91C1C] hover:bg-[#DC2626] disabled:bg-[#B91C1C]/50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition focus:outline-none focus:ring-2 focus:ring-[#B91C1C] focus:ring-offset-2 focus:ring-offset-[#111827]';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      await apiRequest('/api/v1/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
        skipAuth: true,
      });
      setSubmitted(true);
    } catch {
      // Show generic message on any error — don't reveal server details
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <AuthBrand />
        <div className="bg-[#111827] border border-gray-800 rounded-xl p-8">
          {submitted ? (
            <div className="text-center">
              <div className="flex items-center justify-center w-12 h-12 bg-green-900/30 border border-green-700 rounded-full mx-auto mb-4">
                <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-xl font-semibold text-white mb-3">Check your email</h1>
              <p className="text-sm text-gray-400 mb-6">
                If an account with <span className="text-gray-300">{email}</span> exists, we&apos;ve sent a password reset link. Check your inbox and spam folder.
              </p>
              <p className="text-xs text-gray-500 mb-6">The link expires in 1 hour.</p>
              <Link href="/login" className="text-sm text-[#DC2626] hover:text-[#B91C1C] font-medium">
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-white mb-2">Forgot your password?</h1>
              <p className="text-sm text-gray-400 mb-6">
                Enter your email and we&apos;ll send you a reset link.
              </p>
              <form onSubmit={handleSubmit} noValidate className="space-y-5">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1.5">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`${INPUT_CLASS} ${error ? 'border-red-500' : 'border-gray-700'}`}
                    placeholder="you@company.com"
                    disabled={loading}
                  />
                  {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
                </div>
                <button type="submit" disabled={loading} className={BTN_PRIMARY}>
                  {loading ? 'Sending...' : 'Send reset link'}
                </button>
              </form>
              <p className="text-center text-sm text-gray-400 mt-6">
                <Link href="/login" className="text-[#DC2626] hover:text-[#B91C1C] font-medium">
                  Back to sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
