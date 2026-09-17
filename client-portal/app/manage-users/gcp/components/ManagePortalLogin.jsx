'use client';

import { AlertCircle, Loader2, Lock } from 'lucide-react';
import {
  ManagePortalAuthFrame,
  useManagePortalBrand,
} from '@/components/manage-portal/ManagePortalAuthFrame';
import { tenantAccentButton } from '@/lib/tenantAccentStyles';

const labelClass = 'mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500';

export default function ManagePortalLogin({
  token,
  loading,
  error,
  sessionExpired,
  onSubmit,
}) {
  const { accent } = useManagePortalBrand();
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

  const inputClass =
    'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:outline-none focus:ring-1';

  return (
    <ManagePortalAuthFrame
      eyebrow="Gcp LAB"
      title="Gcp Lab Portal"
      description="Admins: use the temporary admin username and password from your email. Provisioned users: sign in with your IAM username and temporary password."
    >
      {missingToken && (
        <div className="mb-5 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Access link required</p>
            <p className="mt-0.5">
              Open the secure link from your email to sign in. The link includes a one-time token.
            </p>
          </div>
        </div>
      )}

      {sessionExpired && (
        <div className="mb-5 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Session expired</p>
            <p className="mt-0.5">Please sign in again using your portal credentials.</p>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-5 flex gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Sign in failed</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="username" className={labelClass}>
            Username or IAM User ID
          </label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            required
            disabled={missingToken || loading}
            className={inputClass}
            style={{ '--tw-ring-color': accent }}
            placeholder="admin-xxxx or rackolab1-xxxxxx"
          />
        </div>

        <div>
          <label htmlFor="password" className={labelClass}>
            Temporary Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={missingToken || loading}
            className={inputClass}
            style={{ '--tw-ring-color': accent }}
            placeholder="From your email"
          />
        </div>

        <button
          type="submit"
          disabled={missingToken || loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50"
          style={tenantAccentButton(accent)}
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
    </ManagePortalAuthFrame>
  );
}
