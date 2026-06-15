'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Cloud, LogOut, RefreshCw, Shield } from 'lucide-react';
import { ErrorState } from '../../../components/dashboard/ErrorState';
import { useManagePortalSession } from '../../hooks/useManagePortalSession';
import { useManagePortalUsers } from '../../hooks/useManagePortalUsers';
import { ManageUserEditor } from './ManageUserEditor';
import { ManageUsersLogin } from './ManageUsersLogin';
import { ManageUsersSecurityNotes } from './ManageUsersSecurityNotes';
import { ManageUsersSummary } from './ManageUsersSummary';
import { ManageUsersTable } from './ManageUsersTable';

export function ManageUsersPortal() {
  const searchParams = useSearchParams();
  const urlToken = searchParams.get('token')?.trim() || null;

  const {
    session,
    bootstrapping,
    loginError,
    loginErrorKind,
    sessionExpired,
    login,
    logout,
    invalidateSession,
    clearLoginError,
  } = useManagePortalSession(true);

  const [loginLoading, setLoginLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [consoleMessage, setConsoleMessage] = useState<string | null>(null);

  const {
    users,
    loading,
    error,
    blocked,
    actionError,
    actionSuccess,
    saving,
    refetch,
    updateRoles,
    deleteUser,
    clearActionFeedback,
  } = useManagePortalUsers(session, invalidateSession);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [users, selectedUserId]
  );

  useEffect(() => {
    if (selectedUserId != null && !users.some((user) => user.id === selectedUserId)) {
      setSelectedUserId(null);
    }
  }, [users, selectedUserId]);

  const handleLogin = useCallback(
    async (credentials: { username: string; password: string }) => {
      if (!urlToken) return;

      clearLoginError();
      setLoginLoading(true);
      try {
        const ok = await login({ token: urlToken, ...credentials });
        if (ok && typeof window !== 'undefined') {
          const nextUrl = new URL(window.location.href);
          nextUrl.searchParams.delete('token');
          window.history.replaceState({}, '', nextUrl.pathname + nextUrl.search);
        }
      } finally {
        setLoginLoading(false);
      }
    },
    [urlToken, login, clearLoginError]
  );

  const handleDeleteUser = useCallback(
    async (userId: number) => {
      const ok = await deleteUser(userId);
      if (ok && selectedUserId === userId) {
        setSelectedUserId(null);
      }
      return ok;
    },
    [deleteUser, selectedUserId]
  );

  if (bootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-[#B91C1C]" />
      </div>
    );
  }

  const showPortal = Boolean(session);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-screen-xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-[#B91C1C]">
              {showPortal ? <Cloud className="h-5 w-5" /> : <Shield className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Racko Cloud</p>
              <h1 className="text-lg font-bold text-gray-900">
                {showPortal ? 'Manage Provisioned Users' : 'Secure Access Portal'}
              </h1>
            </div>
          </div>

          {showPortal && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  clearActionFeedback();
                  void refetch();
                }}
                disabled={loading || saving}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => {
                  logout();
                  setSelectedUserId(null);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-screen-xl px-4 py-8 sm:px-6 lg:px-8">
        {!showPortal ? (
          <div className="space-y-8">
            <div className="mx-auto max-w-lg text-center">
              <h2 className="text-2xl font-bold text-gray-900">Manage Provisioned Users</h2>
              <p className="mt-2 text-sm text-gray-500">
                Review provisioned Azure users, change assigned roles, revoke access, and refresh the
                portal from one secure link.
              </p>
            </div>
            <ManageUsersLogin
              token={urlToken}
              loading={loginLoading}
              error={loginError}
              errorKind={loginErrorKind}
              sessionExpired={sessionExpired}
              onSubmit={handleLogin}
            />
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Manage Provisioned Users</h2>
              <p className="mt-1 text-sm text-gray-500">
                Review provisioned Azure users, change assigned roles, revoke access, and refresh the
                portal from one secure link.
              </p>
            </div>

            <ManageUsersSummary session={session!} />

            {(actionError || actionSuccess || consoleMessage) && (
              <div
                className={`rounded-lg border px-4 py-3 text-sm ${
                  actionError
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : consoleMessage
                      ? 'border-blue-200 bg-blue-50 text-blue-800'
                      : 'border-green-200 bg-green-50 text-green-700'
                }`}
              >
                {actionError || consoleMessage || actionSuccess}
              </div>
            )}

            {blocked && error ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-8 text-center">
                <h3 className="text-base font-semibold text-amber-900">Access blocked</h3>
                <p className="mt-2 text-sm text-amber-800">{error}</p>
              </div>
            ) : error && !loading ? (
              <ErrorState title="Failed to load users" message={error} onRetry={() => void refetch()} />
            ) : (
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                <ManageUsersTable
                  users={users}
                  loading={loading}
                  selectedUserId={selectedUserId}
                  session={session!}
                  onSelect={setSelectedUserId}
                  onConsoleMessage={setConsoleMessage}
                />
                <div className="space-y-4">
                  <ManageUserEditor
                    user={selectedUser}
                    saving={saving}
                    onSaveRoles={updateRoles}
                    onDelete={handleDeleteUser}
                  />
                  <ManageUsersSecurityNotes />
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
