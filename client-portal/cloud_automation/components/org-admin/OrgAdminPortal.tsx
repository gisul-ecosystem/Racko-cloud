'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  ChevronRight,
  ClipboardList,
  Loader2,
  RefreshCw,
  Search,
  Users,
  X,
} from 'lucide-react';
import { ErrorState } from '../../../components/dashboard/ErrorState';
import { useOrgAdminPortal } from '../../hooks/useOrgAdminPortal';
import { OrgAdminAccessRequests } from './OrgAdminAccessRequests';
import { OrgAdminPrivilegedRoleRequests } from './OrgAdminPrivilegedRoleRequests';
import { OrgAdminLabStatusBadge } from './OrgAdminLabStatusBadge';
import { OrgAdminRequestDetailPanel } from './OrgAdminRequestDetailPanel';
import { OrgAdminStatCard } from './OrgAdminStatCard';
import { OrgAdminSubscriptionRoleQuotaCard } from './OrgAdminSubscriptionRoleQuota';
import { CostingModeBadge } from './CostingModeBadge';

const STATUS_FILTERS = ['all', 'completed', 'expired', 'provisioning', 'failed'] as const;

function normalizeStatus(status: string) {
  return status.trim().toLowerCase();
}

export function OrgAdminPortal() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('all');

  const {
    requests,
    selectedRequestId,
    requestDetail,
    users,
    availableRoles,
    accessRequests,
    privilegedRoleRequests,
    overviewLoading,
    detailLoading,
    accessLoading,
    privilegedRoleLoading,
    saving,
    cleanupRunning,
    deletingRequest,
    overviewError,
    detailError,
    actionError,
    actionSuccess,
    selectRequest,
    refreshOverview,
    refreshDetail,
    refreshAccessRequests,
    refreshPrivilegedRoleRequests,
    updateRoles,
    deleteUser,
    deleteRequest,
    extendExpiration,
    sendPurchaseConfirmationMail,
    forceLogout,
    reviewAccess,
    reviewPrivilegedRole,
    fetchUserMonitoring,
    fetchUserAzureCost,
    fetchSharedAzureCost,
    renewBudget,
    updateCleanupSettings,
    triggerCleanup,
    triggerRequestCleanup,
    unblockUser,
    unblockAllUsers,
    blockAllUsers,
    addUser,
    reprovisionRoles,
    clearActionFeedback,
    lastUpdatedAt,
    isRefreshing,
    hasActiveUsers,
    subscriptionRoleQuota,
    subscriptionRoleQuotaLoading,
    subscriptionRoleQuotaError,
  } = useOrgAdminPortal();

  const stats = useMemo(
    () => ({
      active: requests.filter((r) => normalizeStatus(r.status) === 'completed').length,
      expired: requests.filter((r) => normalizeStatus(r.status) === 'expired').length,
      total: requests.length,
      totalUsers: requests.reduce((sum, r) => sum + r.userCount, 0),
    }),
    [requests]
  );

  const regions = useMemo(() => {
    const unique = new Set(
      requests.map((r) => r.region).filter((region): region is string => Boolean(region))
    );
    return Array.from(unique).sort();
  }, [requests]);

  const filtered = useMemo(
    () =>
      requests.filter((request) => {
        const status = normalizeStatus(request.status);
        const matchStatus =
          statusFilter === 'all' ||
          status === statusFilter ||
          (statusFilter === 'completed' && status === 'completed');
        const matchRegion =
          regionFilter === 'all' || (request.region || '').toLowerCase() === regionFilter.toLowerCase();
        const query = search.trim().toLowerCase();
        const matchSearch =
          !query ||
          request.customerEmail.toLowerCase().includes(query) ||
          String(request.id).includes(query) ||
          (request.region || '').toLowerCase().includes(query) ||
          (request.projectName || '').toLowerCase().includes(query) ||
          (request.requestName || '').toLowerCase().includes(query);

        return matchStatus && matchRegion && matchSearch;
      }),
    [requests, statusFilter, regionFilter, search]
  );

  const handleToggleRequest = useCallback(
    (requestId: number) => {
      clearActionFeedback();
      selectRequest(selectedRequestId === requestId ? null : requestId);
    },
    [clearActionFeedback, selectRequest, selectedRequestId]
  );

  const handleRefresh = useCallback(() => {
    clearActionFeedback();
    void refreshOverview();
    void refreshAccessRequests();
    void refreshPrivilegedRoleRequests();
    if (selectedRequestId != null) {
      void refreshDetail();
    }
  }, [clearActionFeedback, refreshOverview, refreshAccessRequests, refreshPrivilegedRoleRequests, refreshDetail, selectedRequestId]);

  const handleToggleCleanup = useCallback(
    (userId: number, disabled: boolean) => updateCleanupSettings(userId, { cleanupDisabled: disabled }),
    [updateCleanupSettings]
  );

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Azure Lab Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage provisioned lab requests and user access
          </p>
        </div>

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
      </div>

      <OrgAdminSubscriptionRoleQuotaCard
        quota={subscriptionRoleQuota}
        loading={subscriptionRoleQuotaLoading}
        error={subscriptionRoleQuotaError}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OrgAdminStatCard
          label="Active Labs"
          value={stats.active}
          color="green"
          icon="🟢"
          onClick={() => setStatusFilter('completed')}
          active={statusFilter === 'completed'}
        />
        <OrgAdminStatCard
          label="Expired Labs"
          value={stats.expired}
          color="orange"
          icon="🔴"
          onClick={() => setStatusFilter('expired')}
          active={statusFilter === 'expired'}
        />
        <OrgAdminStatCard
          label="Total Requests"
          value={stats.total}
          color="blue"
          icon="📋"
          onClick={() => setStatusFilter('all')}
          active={statusFilter === 'all'}
        />
        <OrgAdminStatCard label="Total Users" value={stats.totalUsers} color="purple" icon="👥" />
      </div>

      <OrgAdminAccessRequests
        requests={accessRequests}
        loading={accessLoading}
        saving={saving}
        onReview={reviewAccess}
      />

      <OrgAdminPrivilegedRoleRequests
        requests={privilegedRoleRequests}
        loading={privilegedRoleLoading}
        saving={saving}
        onReview={reviewPrivilegedRole}
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

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by email, request ID, or region..."
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-9 text-sm focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1">
          {STATUS_FILTERS.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                statusFilter === status
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        {regions.length > 0 && (
          <select
            value={regionFilter}
            onChange={(event) => setRegionFilter(event.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]"
          >
            <option value="all">All regions</option>
            {regions.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
        )}

        <span className="text-sm text-gray-400">
          {filtered.length} request{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {overviewError && !overviewLoading ? (
        <ErrorState
          title="Failed to load requests"
          message={overviewError}
          onRetry={() => void refreshOverview()}
        />
      ) : (
        <div className="space-y-2">
          {overviewLoading && requests.length === 0 && (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-16 text-sm text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin text-[#B91C1C]" />
              Loading requests...
            </div>
          )}

          {!overviewLoading && filtered.length === 0 && (
            <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
              <ClipboardList className="mx-auto mb-3 h-10 w-10 text-gray-300" />
              <p className="text-sm font-medium text-gray-900">No requests found</p>
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="mt-3 text-sm text-[#B91C1C] hover:underline"
                >
                  Clear search
                </button>
              )}
            </div>
          )}

          {filtered.map((request) => {
            const open = selectedRequestId === request.id;
            const startRaw = request.startsAt || request.startDate;
            const expiryRaw = request.expiresAt || request.expiryDate;

            return (
              <div key={request.id}>
                <button
                  type="button"
                  onClick={() => handleToggleRequest(request.id)}
                  className={`flex w-full flex-wrap items-center gap-4 rounded-xl border bg-white px-5 py-4 text-left transition hover:border-blue-300 hover:shadow-sm ${
                    open
                      ? 'rounded-b-none border-[#B91C1C]/40 border-b-transparent'
                      : 'border-gray-200'
                  }`}
                >
                  <div className="min-w-[220px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="truncate text-sm font-bold text-gray-900">
                        {request.projectName?.trim() || `Project ${request.id}`}
                      </div>
                      {request.idMode === 'test_ids' ? (
                        <span className="inline-flex shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200">
                          Test ID
                        </span>
                      ) : null}
                    </div>
                    <div className="text-sm text-gray-500">{request.customerEmail}</div>
                  </div>

                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    {request.region && (
                      <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                        {request.region}
                      </span>
                    )}
                    <CostingModeBadge mode={request.costingMode} />
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
                      <Users className="h-3 w-3" />
                      {request.userCount} user{request.userCount !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="ml-auto flex min-w-[160px] flex-col items-end gap-1.5">
                    <OrgAdminLabStatusBadge status={request.status} />
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <span>
                        {startRaw
                          ? new Date(startRaw).toLocaleString(undefined, {
                          month: 'numeric',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                          : '—'}
                      </span>
                      <span>→</span>
                      <span>
                        {expiryRaw
                          ? new Date(expiryRaw).toLocaleString(undefined, {
                          month: 'numeric',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                          : '—'}
                      </span>
                    </div>
                    <ChevronRight
                      className={`h-5 w-5 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
                    />
                  </div>
                </button>

                {open && (
                  <OrgAdminRequestDetailPanel
                    request={request}
                    requestDetail={requestDetail}
                    users={users}
                    availableRoles={availableRoles}
                    loading={detailLoading}
                    detailError={detailError}
                    saving={saving}
                    cleanupRunning={cleanupRunning}
                    deletingRequest={deletingRequest}
                    onRetry={() => void refreshDetail()}
                    onForceLogout={forceLogout}
                    onUpdateRoles={updateRoles}
                    fetchUserMonitoring={fetchUserMonitoring}
                    onFetchAzureCost={fetchUserAzureCost}
                    onFetchSharedAzureCost={fetchSharedAzureCost}
                    onRenewBudget={renewBudget}
                    onToggleCleanup={handleToggleCleanup}
                    onManualCleanup={triggerCleanup}
                    onRequestCleanup={triggerRequestCleanup}
                    onUnblock={unblockUser}
                    onUnblockAll={unblockAllUsers}
                    onBlockAll={blockAllUsers}
                    onAddUser={addUser}
                    onDeleteUser={deleteUser}
                    onDeleteRequest={deleteRequest}
                    onExtendExpiration={extendExpiration}
                    onSendPurchaseConfirmationMail={sendPurchaseConfirmationMail}
                    onReprovisionRoles={reprovisionRoles}
                    onPrivilegedRolesChanged={() => void refreshDetail()}
                    lastUpdatedAt={lastUpdatedAt}
                    isRefreshing={isRefreshing}
                    hasActiveUsers={hasActiveUsers}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
