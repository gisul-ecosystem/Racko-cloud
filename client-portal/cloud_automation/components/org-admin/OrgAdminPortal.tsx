'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { ArrowLeft, LogOut, RefreshCw, Shield } from 'lucide-react';
import { ErrorState } from '../../../components/dashboard/ErrorState';
import { AZURE_ROUTES } from '../../constants';
import { useOrgAdminPortal } from '../../hooks/useOrgAdminPortal';
import { useOrgAdminSession } from '../../hooks/useOrgAdminSession';
import { OrgAdminAccessRequests } from './OrgAdminAccessRequests';
import { OrgAdminLogin } from './OrgAdminLogin';
import { OrgAdminRequestSummary } from './OrgAdminRequestSummary';
import { OrgAdminResourceGroupList } from './OrgAdminResourceGroupList';
import { OrgAdminUserPanel } from './OrgAdminUserPanel';
import { OrgAdminUsersTable } from './OrgAdminUsersTable';

export function OrgAdminPortal() {
  const {
    session,
    bootstrapping,
    loginError,
    sessionExpired,
    login,
    logout,
    invalidateSession,
    clearLoginError,
  } = useOrgAdminSession();

  const [loginLoading, setLoginLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const {
    resourceGroups,
    selectedRequestId,
    requestDetail,
    users,
    availableRoles,
    accessRequests,
    overviewLoading,
    detailLoading,
    accessLoading,
    saving,
    overviewError,
    detailError,
    actionError,
    actionSuccess,
    selectRequest,
    refreshOverview,
    refreshDetail,
    refreshAccessRequests,
    updateRoles,
    deleteUser,
    forceLogout,
    reviewAccess,
    fetchUserMonitoring,
    fetchUserAzureCost,
    clearActionFeedback,
  } = useOrgAdminPortal(session, invalidateSession);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [users, selectedUserId]
  );

  const handleLogin = useCallback(
    async (credentials: { email: string; username: string; password: string }) => {
      clearLoginError();
      setLoginLoading(true);
      try {
        await login(credentials);
      } finally {
        setLoginLoading(false);
      }
    },
    [login, clearLoginError]
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

  const handleRefresh = useCallback(() => {
    clearActionFeedback();
    void refreshOverview();
    void refreshDetail();
    void refreshAccessRequests();
  }, [clearActionFeedback, refreshOverview, refreshDetail, refreshAccessRequests]);

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
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-[#B91C1C]">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Racko Cloud</p>
              <h1 className="text-lg font-bold text-gray-900">Organization Admin</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {showPortal ? (
              <>
                <span className="hidden text-sm text-gray-500 sm:inline">
                  {session!.admin.email}
                </span>
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={overviewLoading || detailLoading || saving}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${overviewLoading || detailLoading ? 'animate-spin' : ''}`}
                  />
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
              </>
            ) : (
              <Link
                href={AZURE_ROUTES.dashboard}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-50"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-screen-2xl px-4 py-8 sm:px-6 lg:px-8">
        {!showPortal ? (
          <div className="space-y-8">
            <div className="mx-auto max-w-lg text-center">
              <h2 className="text-2xl font-bold text-gray-900">Organization Admin Portal</h2>
              <p className="mt-2 text-sm text-gray-500">
                Manage provisioned resource groups, users, sessions, and elevated access requests across
                your organization.
              </p>
            </div>
            <OrgAdminLogin
              loading={loginLoading}
              error={loginError}
              sessionExpired={sessionExpired}
              onSubmit={handleLogin}
            />
          </div>
        ) : (
          <div className="space-y-6">
            <OrgAdminAccessRequests
              requests={accessRequests}
              loading={accessLoading}
              saving={saving}
              onReview={reviewAccess}
            />

            {(actionError || actionSuccess) && (
              <div
                className={`rounded-lg border px-4 py-3 text-sm ${
                  actionError
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : 'border-green-200 bg-green-50 text-green-700'
                }`}
              >
                {actionError || actionSuccess}
              </div>
            )}

            {overviewError && !overviewLoading ? (
              <ErrorState
                title="Failed to load resource groups"
                message={overviewError}
                onRetry={() => void refreshOverview()}
              />
            ) : (
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
                <OrgAdminResourceGroupList
                  groups={resourceGroups}
                  selectedRequestId={selectedRequestId}
                  loading={overviewLoading}
                  onSelect={selectRequest}
                />

                <div className="space-y-6">
                  <OrgAdminRequestSummary
                    request={requestDetail}
                    users={users}
                    loading={detailLoading}
                  />

                  {detailError && !detailLoading ? (
                    <ErrorState
                      title="Failed to load request detail"
                      message={detailError}
                      onRetry={() => void refreshDetail()}
                    />
                  ) : (
                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
                      <OrgAdminUsersTable
                        users={users}
                        request={requestDetail}
                        requestId={selectedRequestId}
                        sessionToken={session!.sessionToken}
                        availableRoles={availableRoles}
                        loading={detailLoading}
                        selectedUserId={selectedUserId}
                        saving={saving}
                        onSelect={setSelectedUserId}
                        onForceLogout={forceLogout}
                        onUpdateRoles={updateRoles}
                        fetchUserMonitoring={fetchUserMonitoring}
                        onFetchAzureCost={fetchUserAzureCost}
                      />
                      <OrgAdminUserPanel
                        user={selectedUser}
                        saving={saving}
                        onSaveRoles={updateRoles}
                        onDelete={handleDeleteUser}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
