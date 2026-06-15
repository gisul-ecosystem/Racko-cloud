'use client';

import { AlertCircle, Loader2, Lock, Shield } from 'lucide-react';

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]';

const labelClass = 'mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500';

interface OrgAdminLoginProps {
  loading: boolean;
  error: string | null;
  sessionExpired: boolean;
  onSubmit: (credentials: { email: string; username: string; password: string }) => Promise<void>;
}

export function OrgAdminLogin({ loading, error, sessionExpired, onSubmit }: OrgAdminLoginProps) {
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const form = new FormData(event.currentTarget);
    await onSubmit({
      email: String(form.get('email') || '').trim(),
      username: String(form.get('username') || '').trim(),
      password: String(form.get('password') || ''),
    });
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gray-50 px-6 py-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-red-50 text-[#B91C1C]">
            <Shield className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Organization Admin</h1>
          <p className="mt-2 text-sm text-gray-500">
            Sign in with your organization admin email, username, and password.
          </p>
        </div>

        <div className="p-6">
          {(sessionExpired || error) && (
            <div
              className={`mb-5 flex gap-3 rounded-lg border px-4 py-3 text-sm ${
                sessionExpired
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : 'border-red-200 bg-red-50 text-red-700'
              }`}
            >
              {sessionExpired ? (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <div>
                <p className="font-medium">{sessionExpired ? 'Session expired' : 'Sign in failed'}</p>
                <p className="mt-0.5">
                  {sessionExpired
                    ? 'Your organization admin session has ended. Sign in again to continue.'
                    : error}
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="org-admin-email" className={labelClass}>
                Email
              </label>
              <input
                id="org-admin-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                disabled={loading}
                className={inputClass}
                placeholder="admin@company.com"
              />
            </div>

            <div>
              <label htmlFor="org-admin-username" className={labelClass}>
                Username
              </label>
              <input
                id="org-admin-username"
                name="username"
                type="text"
                autoComplete="username"
                required
                disabled={loading}
                className={inputClass}
                placeholder="org-admin"
              />
            </div>

            <div>
              <label htmlFor="org-admin-password" className={labelClass}>
                Password
              </label>
              <input
                id="org-admin-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                disabled={loading}
                className={inputClass}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#a01717] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Authenticating…
                </>
              ) : (
                'Open Organization Admin'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
