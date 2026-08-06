'use client';

import { AlertCircle, Loader2, Lock } from 'lucide-react';
import type { ManagePortalErrorKind } from '../../types/managePortal';
import {
  ManagePortalAuthFrame,
  useManagePortalBrand,
} from '@/components/manage-portal/ManagePortalAuthFrame';
import { tenantAccentButton } from '@/lib/tenantAccentStyles';

const labelClass = 'mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500';

interface ManageUsersLoginProps {
  token: string | null;
  loading: boolean;
  error: string | null;
  errorKind: ManagePortalErrorKind | null;
  sessionExpired: boolean;
  onSubmit: (credentials: { username: string; password: string }) => Promise<void>;
}

function resolveBanner(
  error: string | null,
  errorKind: ManagePortalErrorKind | null,
  sessionExpired: boolean,
  missingToken: boolean
) {
  if (missingToken) {
    return {
      title: 'Access link required',
      message: 'Open the secure link from your email to sign in. The link includes a one-time token.',
      tone: 'warning' as const,
    };
  }

  if (sessionExpired) {
    return {
      title: 'Session expired',
      message:
        'Your portal session has ended. Request a new secure access link to sign in again — previous email links cannot be reused.',
      tone: 'warning' as const,
    };
  }

  if (!error) return null;

  if (errorKind === 'expired_link' || errorKind === 'invalid_token') {
    return {
      title: 'Link no longer valid',
      message: error,
      tone: 'warning' as const,
    };
  }

  if (errorKind === 'blocked_access') {
    return {
      title: 'Access blocked',
      message: error,
      tone: 'danger' as const,
    };
  }

  return {
    title: 'Sign in failed',
    message: error,
    tone: 'danger' as const,
  };
}

export function ManageUsersLogin({
  token,
  loading,
  error,
  errorKind,
  sessionExpired,
  onSubmit,
}: ManageUsersLoginProps) {
  const { accent } = useManagePortalBrand();
  const missingToken = !token?.trim();
  const banner = resolveBanner(error, errorKind, sessionExpired, missingToken);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
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
      eyebrow="AZURE LAB"
      title="Manage Portal Login"
      description="Admins: use the temporary admin username and password from your email. Provisioned users: sign in with your Azure username or user ID and temporary password."
    >
      {banner && (
        <div
          className={`mb-5 flex gap-3 rounded-lg border px-4 py-3 text-sm ${
            banner.tone === 'danger'
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          {banner.tone === 'danger' ? (
            <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div>
            <p className="font-medium">{banner.title}</p>
            <p className="mt-0.5">{banner.message}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="username" className={labelClass}>
            Username or Azure User ID
          </label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            required
            disabled={missingToken || loading}
            className={inputClass}
            style={{ ['--tw-ring-color' as string]: accent }}
            placeholder="admin-username or azure-user-id"
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
            style={{ ['--tw-ring-color' as string]: accent }}
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
