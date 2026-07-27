'use client';

import { useEffect } from 'react';
import { Loader2, X } from 'lucide-react';
import { ErrorState } from '../../../components/dashboard/ErrorState';
import { OrgAdminRequestSummary } from './OrgAdminRequestSummary';
import { OrgAdminUserPanel } from './OrgAdminUserPanel';
import { OrgAdminUsersTable } from './OrgAdminUsersTable';
import type {
  OrgAdminAzureRoleOption,
  OrgAdminMonitoringResponse,
  OrgAdminRequestDetail,
  OrgAdminUser,
  OrgAdminUserAzureCost,
  OrgAdminSharedAzureCostSummary,
} from '../../types/orgAdmin';

interface OrgAdminRequestDetailDrawerProps {
  open: boolean;
  requestId: number | null;
  request: OrgAdminRequestDetail | null;
  users: OrgAdminUser[];
  availableRoles: OrgAdminAzureRoleOption[];
  loading: boolean;
  detailError: string | null;
  saving: boolean;
  selectedUserId: number | null;
  onClose: () => void;
  onRetry: () => void;
  onSelectUser: (userId: number | null) => void;
  onForceLogout: (userId: number) => Promise<boolean>;
  onUnblock?: (userId: number) => Promise<boolean>;
  onTriggerCleanup?: (userId: number) => Promise<boolean>;
  onUpdateRoles: (userId: number, roles: string[]) => Promise<boolean>;
  onDeleteUser: (userId: number) => Promise<boolean>;
  fetchUserMonitoring: (userId: number) => Promise<OrgAdminMonitoringResponse | null>;
  onFetchAzureCost: (userId: number, options?: { refresh?: boolean }) => Promise<OrgAdminUserAzureCost | null>;
  onFetchSharedAzureCost?: (options?: { refresh?: boolean }) => Promise<OrgAdminSharedAzureCostSummary | null>;
  lastUpdatedAt?: Date | null;
  isRefreshing?: boolean;
  hasActiveUsers?: boolean;
}

export function OrgAdminRequestDetailDrawer({
  open,
  requestId,
  request,
  users,
  availableRoles,
  loading,
  detailError,
  saving,
  selectedUserId,
  onClose,
  onRetry,
  onSelectUser,
  onForceLogout,
  onUnblock,
  onTriggerCleanup,
  onUpdateRoles,
  onDeleteUser,
  fetchUserMonitoring,
  onFetchAzureCost,
  onFetchSharedAzureCost,
  lastUpdatedAt = null,
  isRefreshing = false,
  hasActiveUsers = false,
}: OrgAdminRequestDetailDrawerProps) {
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open || requestId == null) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close request details"
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <div
        className="relative flex h-full w-full max-w-5xl flex-col border-l border-gray-200 bg-gray-50 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="org-admin-request-title"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Provisioned project</p>
            <h2 id="org-admin-request-title" className="flex flex-wrap items-center gap-2 text-lg font-bold text-gray-900">
              <span>{request?.projectName?.trim() || `Project ${requestId}`}</span>
              {request?.idMode === 'test_ids' ? (
                <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200">
                  Test ID
                </span>
              ) : null}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading && !request ? (
            <div className="flex min-h-[240px] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
            </div>
          ) : detailError && !request ? (
            <ErrorState title="Failed to load request detail" message={detailError} onRetry={onRetry} />
          ) : (
            <div className="space-y-5">
              <OrgAdminRequestSummary request={request} users={users} loading={loading} />

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
                <OrgAdminUsersTable
                  users={users}
                  request={request}
                  requestId={requestId}
                  availableRoles={availableRoles}
                  loading={loading}
                  selectedUserId={selectedUserId}
                  saving={saving}
                  isRefreshing={isRefreshing}
                  lastUpdatedAt={lastUpdatedAt}
                  hasActiveUsers={hasActiveUsers}
                  onSelect={onSelectUser}
                  onForceLogout={onForceLogout}
                  onUnblock={onUnblock}
                  onTriggerCleanup={onTriggerCleanup}
                  onUpdateRoles={onUpdateRoles}
                  fetchUserMonitoring={fetchUserMonitoring}
                  onFetchAzureCost={onFetchAzureCost}
                  onFetchSharedAzureCost={onFetchSharedAzureCost}
                />
                <OrgAdminUserPanel
                  user={selectedUser}
                  saving={saving}
                  onSaveRoles={onUpdateRoles}
                  onDelete={onDeleteUser}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
