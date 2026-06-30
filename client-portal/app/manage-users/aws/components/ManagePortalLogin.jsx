'use client';

import { Loader2, Lock } from 'lucide-react';

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]';

const labelClass = 'mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500';

export default function ManagePortalLogin({
  token,
  loading,
  error,
  onSubmit,
}) {
  const missingToken = !token?.trim();

  async function handleSubmit(event) {
    event.preventDefault();
    if (missingToken || loading) return;

    const form = new FormData(event.currentTarget);
    await onSubmit({
      username: String(form.get('username') || '').trim(),
      password: String(form.get('password') || ''),
    });
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gray-50 px-6 py-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-red-50 text-[#B91C1C]">
            <Lock className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">AWS Lab Portal</h1>
          <p className="mt-2 text-sm text-gray-500">
            Enter your portal credentials from the provisioning email.
          </p>
        </div>

        <div className="p-6">
          {missingToken && (
            <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Open the secure link from your email to sign in. The link includes a one-time token.
            </div>
          )}

          {error && (
            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username" className={labelClass}>
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                disabled={missingToken || loading}
                className={inputClass}
                placeholder="admin-xxxx"
              />
            </div>

            <div>
              <label htmlFor="password" className={labelClass}>
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                disabled={missingToken || loading}
                className={inputClass}
                placeholder="From your email"
              />
            </div>

            <button
              type="submit"
              disabled={missingToken || loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#a01717] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Authenticating…
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
