'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { RequestStatusBadge } from '../RequestStatusBadge';
import {
  fetchManagePortalUsageStatus,
  type ManagePortalUsageStatus,
} from '../../api/managePortalClient';
import {
  getAzureConsoleLaunchErrorMessage,
  launchAzureConsole,
} from '../../utils/azureConsoleLaunch';
import type { ManagePortalSession, ManagePortalUser } from '../../types/managePortal';

interface ManageUserAccountStatusProps {
  user: ManagePortalUser;
  session: ManagePortalSession;
  onConsoleMessage: (message: string | null) => void;
}

function RoleChips({ roles }: { roles: ManagePortalUser['roles'] }) {
  if (roles.length === 0) {
    return <span className="text-sm text-gray-400">No roles assigned</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {roles.map((entry) => (
        <span
          key={`${entry.role}-${entry.scope ?? 'default'}`}
          className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-700"
        >
          {entry.role}
        </span>
      ))}
    </div>
  );
}

function UsageDetails({ usage }: { usage: ManagePortalUsageStatus }) {
  if (!usage.enableDailyUsage) {
    return null;
  }

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-700">
      <p className="font-medium text-gray-900">Daily usage</p>
      <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">Used today</dt>
          <dd className="font-medium">{usage.usedMinutes} min</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">Remaining</dt>
          <dd className="font-medium">
            {usage.remainingMinutes != null ? `${usage.remainingMinutes} min` : 'Unlimited'}
          </dd>
        </div>
      </dl>
      {usage.accessMessage ? (
        <p className="mt-2 text-xs text-gray-600">{usage.accessMessage}</p>
      ) : null}
    </div>
  );
}

export function ManageUserAccountStatus({
  user,
  session,
  onConsoleMessage,
}: ManageUserAccountStatusProps) {
  const [usage, setUsage] = useState<ManagePortalUsageStatus | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadUsage() {
      setUsageLoading(true);
      try {
        const status = await fetchManagePortalUsageStatus({
          requestId: session.requestId,
          userId: user.id,
          sessionToken: session.sessionToken,
        });
        if (!cancelled) {
          setUsage(status);
        }
      } catch {
        if (!cancelled) {
          setUsage(null);
        }
      } finally {
        if (!cancelled) {
          setUsageLoading(false);
        }
      }
    }

    void loadUsage();

    return () => {
      cancelled = true;
    };
  }, [session.requestId, session.sessionToken, user.id]);

  const handleConsoleLaunch = useCallback(async () => {
    onConsoleMessage(null);
    setLaunching(true);

    try {
      const result = await launchAzureConsole({
        requestId: session.requestId,
        userId: user.id,
        sessionToken: session.sessionToken,
      });
      onConsoleMessage(result.message);
    } catch (error) {
      onConsoleMessage(getAzureConsoleLaunchErrorMessage(error));
    } finally {
      setLaunching(false);
    }
  }, [onConsoleMessage, session.requestId, session.sessionToken, user.id]);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-6 py-4">
        <h2 className="text-sm font-semibold text-gray-900">My Account</h2>
        <p className="mt-0.5 text-xs text-gray-500">Your provisioned Azure account status</p>
      </div>

      <div className="space-y-5 p-6">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Username</dt>
            <dd className="mt-1 text-sm font-semibold text-gray-900">{user.username}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Status</dt>
            <dd className="mt-1">
              <RequestStatusBadge status={user.status} />
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Azure User ID</dt>
            <dd className="mt-1 break-all font-mono text-xs text-gray-700">
              {user.azureUserId || '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Access expiry</dt>
            <dd className="mt-1 text-sm text-gray-900">{user.expiryDate || '—'}</dd>
          </div>
        </dl>

        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Assigned roles</dt>
          <dd className="mt-2">
            <RoleChips roles={user.roles} />
          </dd>
        </div>

        {usageLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading usage status…
          </div>
        ) : usage ? (
          <UsageDetails usage={usage} />
        ) : null}

        <button
          type="button"
          onClick={() => void handleConsoleLaunch()}
          disabled={launching}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--cloud-accent,#B91C1C)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[color-mix(in_srgb,var(--cloud-accent,#B91C1C)_88%,black)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {launching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ExternalLink className="h-4 w-4" />
          )}
          Open Azure Console
        </button>
      </div>
    </div>
  );
}
