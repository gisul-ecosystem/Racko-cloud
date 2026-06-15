'use client';

import { useCallback, useState } from 'react';
import { ExternalLink, Loader2, Users } from 'lucide-react';
import { RequestStatusBadge } from '../RequestStatusBadge';
import { TableSkeleton } from '../../../components/dashboard/LoadingSkeleton';
import {
  getAzureConsoleLaunchErrorMessage,
  launchAzureConsole,
} from '../../utils/azureConsoleLaunch';
import type { ManagePortalSession, ManagePortalUser } from '../../types/managePortal';

interface ManageUsersTableProps {
  users: ManagePortalUser[];
  loading: boolean;
  selectedUserId: number | null;
  session: ManagePortalSession;
  onSelect: (userId: number) => void;
  onConsoleMessage: (message: string | null) => void;
}

function RoleChips({ roles }: { roles: ManagePortalUser['roles'] }) {
  if (roles.length === 0) {
    return <span className="text-xs text-gray-400">No roles assigned</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((entry) => (
        <span
          key={`${entry.role}-${entry.scope ?? 'default'}`}
          className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700"
        >
          {entry.role}
        </span>
      ))}
    </div>
  );
}

export function ManageUsersTable({
  users,
  loading,
  selectedUserId,
  session,
  onSelect,
  onConsoleMessage,
}: ManageUsersTableProps) {
  const [launchingUserId, setLaunchingUserId] = useState<number | null>(null);

  const handleConsoleLaunch = useCallback(
    async (event: React.MouseEvent, user: ManagePortalUser) => {
      event.stopPropagation();
      onConsoleMessage(null);
      setLaunchingUserId(user.id);

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
        setLaunchingUserId(null);
      }
    },
    [onConsoleMessage, session.requestId, session.sessionToken]
  );

  if (loading) {
    return (
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <div className="h-4 w-40 animate-pulse rounded bg-gray-200" />
        </div>
        <TableSkeleton rows={5} cols={6} embedded />
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-6 py-16 text-center shadow-sm">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-400">
          <Users className="h-6 w-6" />
        </div>
        <h3 className="text-base font-semibold text-gray-900">No provisioned users</h3>
        <p className="mt-1 max-w-sm text-sm text-gray-500">
          Users will appear here once provisioning completes for this request.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-6 py-4">
        <h2 className="text-sm font-semibold text-gray-900">Provisioned Users</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          Select a user to edit roles or revoke access. Use Console to sign in to Azure.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3 font-medium">Username</th>
              <th className="px-4 py-3 font-medium">Azure User ID</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Roles</th>
              <th className="px-4 py-3 font-medium">Expiry</th>
              <th className="px-4 py-3 font-medium">Console</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const selected = selectedUserId === user.id;
              const launching = launchingUserId === user.id;

              return (
                <tr
                  key={user.id}
                  onClick={() => onSelect(user.id)}
                  className={`cursor-pointer border-b border-gray-50 transition hover:bg-gray-50 ${
                    selected ? 'bg-red-50/60' : ''
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{user.username}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">
                    {user.azureUserId || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <RequestStatusBadge status={user.status} />
                  </td>
                  <td className="px-4 py-3">
                    <RoleChips roles={user.roles} />
                  </td>
                  <td className="px-4 py-3 text-gray-600">{user.expiryDate || '—'}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={(event) => void handleConsoleLaunch(event, user)}
                      disabled={launching || launchingUserId != null}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:border-[#B91C1C]/30 hover:bg-red-50 hover:text-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-50"
                      title="Open Azure Portal sign-in for this user"
                    >
                      {launching ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ExternalLink className="h-3.5 w-3.5" />
                      )}
                      Console
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
