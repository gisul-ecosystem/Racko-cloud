'use client';

import { useMemo } from 'react';
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
import { AwsCostingModeBadge } from './AwsCostingModeBadge';
import { AwsLabStatusBadge } from './AwsLabStatusBadge';
import { AwsOrgAdminRequestDetailPanel } from './AwsOrgAdminRequestDetailPanel';
import { AwsOrgAdminStatCard } from './AwsOrgAdminStatCard';
import { formatCurrency } from '../../api/orgAdminClient';

export function OrgAdminPortal() {
  const {
    requests,
    selectedRequestId,
    requestDetail,
    iamPolicies,
    overviewLoading,
    detailLoading,
    saving,
    overviewError,
    detailError,
    actionError,
    actionSuccess,
    statusFilter,
    setStatusFilter,
    regionFilter,
    setRegionFilter,
    search,
    setSearch,
    activeTab,
    setActiveTab,
    stats,
    regions,
    statusFilters,
    selectRequest,
    refreshDetail,
    handleRefresh,
    handleSuspend,
    handleReinstate,
    handleDeleteUser,
    handleConsoleUrl,
    handleUpdatePermissions,
    handleRenewBudget,
    handleCleanup,
    handleSyncSpend,
    handleToggleCleanup,
    fetchUserCost,
    handleForceLogout,
    fetchUserMonitoring,
    clearActionFeedback,
  } = useOrgAdminPortal();

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return requests;

    return requests.filter(
      (request) =>
        request.customerEmail.toLowerCase().includes(query) ||
        String(request.requestId).includes(query) ||
        (request.region || '').toLowerCase().includes(query)
    );
  }, [requests, search]);

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AWS Lab Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage provisioned AWS lab requests and user access
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AwsOrgAdminStatCard
          label="Active Labs"
          value={stats.active}
          color="green"
          icon="🟢"
          onClick={() => setStatusFilter('Completed')}
          active={statusFilter === 'Completed'}
        />
        <AwsOrgAdminStatCard
          label="Expired Labs"
          value={stats.expired}
          color="orange"
          icon="🔴"
          onClick={() => setStatusFilter('Expired')}
          active={statusFilter === 'Expired'}
        />
        <AwsOrgAdminStatCard
          label="Total Requests"
          value={stats.total}
          color="blue"
          icon="📋"
          onClick={() => setStatusFilter('All')}
          active={statusFilter === 'All'}
        />
        <AwsOrgAdminStatCard label="Total Users" value={stats.totalUsers} color="purple" icon="👥" />
      </div>

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
          {statusFilters.map((status) => (
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
              {status}
            </button>
          ))}
        </div>

        {regions.length > 0 && (
          <select
            value={regionFilter}
            onChange={(event) => setRegionFilter(event.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]"
          >
            <option value="All">All regions</option>
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
          onRetry={handleRefresh}
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
            const open = selectedRequestId === request.requestId;

            return (
              <div key={request.requestId}>
                <button
                  type="button"
                  onClick={() => {
                    clearActionFeedback();
                    selectRequest(request.requestId);
                  }}
                  className={`flex w-full flex-wrap items-center gap-4 rounded-xl border bg-white px-5 py-4 text-left transition hover:border-blue-300 hover:shadow-sm ${
                    open
                      ? 'rounded-b-none border-[#B91C1C]/40 border-b-transparent'
                      : 'border-gray-200'
                  }`}
                >
                  <div className="min-w-[180px]">
                    <div className="text-sm font-bold text-gray-900">
                      #{String(request.requestId).slice(-6)}
                    </div>
                    <div className="text-sm text-gray-500">{request.customerEmail}</div>
                  </div>

                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    {request.region && (
                      <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                        {request.region}
                      </span>
                    )}
                    <AwsCostingModeBadge mode={request.costingMode} />
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
                      <Users className="h-3 w-3" />
                      {request.userCount} user{request.userCount !== 1 ? 's' : ''}
                    </span>
                    {(request.selectedServices || []).slice(0, 2).map((service) => (
                      <span
                        key={service}
                        className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600"
                      >
                        {service}
                      </span>
                    ))}
                  </div>

                  <div className="ml-auto flex min-w-[160px] flex-col items-end gap-1.5">
                    <AwsLabStatusBadge status={request.status} />
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <span>{new Date(request.startDate).toLocaleDateString()}</span>
                      <span>→</span>
                      <span>
                        {request.endDate ? new Date(request.endDate).toLocaleDateString() : '—'}
                      </span>
                    </div>
                    <div className="text-xs font-medium text-gray-600">
                      Est. {formatCurrency(request.estimatedPrice || 0)}
                    </div>
                    <ChevronRight
                      className={`h-5 w-5 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
                    />
                  </div>
                </button>

                {open && (
                  <AwsOrgAdminRequestDetailPanel
                    request={request}
                    requestDetail={requestDetail}
                    iamPolicies={iamPolicies}
                    loading={detailLoading}
                    detailError={detailError}
                    saving={saving}
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    onRetry={() => void refreshDetail()}
                    onSyncSpend={handleSyncSpend}
                    onSuspend={handleSuspend}
                    onReinstate={handleReinstate}
                    onDelete={handleDeleteUser}
                    onConsoleUrl={handleConsoleUrl}
                    onUpdatePermissions={handleUpdatePermissions}
                    onRenewBudget={handleRenewBudget}
                    onCleanup={handleCleanup}
                    onToggleCleanup={handleToggleCleanup}
                    onFetchCost={fetchUserCost}
                    onForceLogout={handleForceLogout}
                    fetchUserMonitoring={fetchUserMonitoring}
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
