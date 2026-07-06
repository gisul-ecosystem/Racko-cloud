'use client';

import { useState } from 'react';
import { Loader2, Pause, Trash2 } from 'lucide-react';
import type { OrgAdminRequestDetail, OrgAdminUser } from '../../types/orgAdmin';

interface OrgAdminCleanupTabProps {
  users: OrgAdminUser[];
  request: OrgAdminRequestDetail | null;
  requestId: number;
  saving: boolean;
  onToggleCleanup: (userId: number, disabled: boolean) => Promise<boolean>;
  onManualCleanup: (userId: number) => Promise<boolean>;
}

export function OrgAdminCleanupTab({
  users,
  request,
  saving,
  onToggleCleanup,
  onManualCleanup,
}: OrgAdminCleanupTabProps) {
  const [busyUserId, setBusyUserId] = useState<number | null>(null);

  const autoCleanupEnabled = request?.resourceCleanupEnabled === true;
  const cleanupAction = request?.resourceCleanupAction === 'pause' ? 'pause' : 'delete';
  const isPause = cleanupAction === 'pause';
  const cleanupActionLabel = isPause ? 'Pause' : 'Delete';
  const autoActionLabel = isPause ? 'Auto pause' : 'Auto cleanup';

  async function handleToggle(userId: number, disabled: boolean) {
    setBusyUserId(userId);
    try {
      await onToggleCleanup(userId, disabled);
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleCleanup(userId: number) {
    if (
      !window.confirm(
        isPause
          ? "Pause all Azure resources inside this user's lab right now?"
          : "Delete all Azure resources inside this user's lab right now?"
      )
    ) {
      return;
    }
    setBusyUserId(userId);
    try {
      await onManualCleanup(userId);
    } finally {
      setBusyUserId(null);
    }
  }

  if (users.length === 0) {
    return (
      <div className="px-6 py-10 text-center text-sm text-gray-500">No users in this request.</div>
    );
  }

  return (
    <div className="space-y-4 px-6 py-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">Resource Cleanup</h3>
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
              isPause ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-700'
            }`}
          >
            {cleanupActionLabel} mode
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          {isPause
            ? 'Pauses Azure resources created by each user inside their resource group (VMs deallocated, SQL paused, AKS scaled to zero, App Services stopped). RBAC role assignments are preserved so users can recreate or resume resources after cleanup.'
            : 'Deletes Azure resources created by each user inside their resource group. RBAC role assignments are preserved so users can recreate resources after cleanup.'}{' '}
          When the lab expires, all resource group permissions are removed from Azure automatically.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3.5">
        <div>
          <p className="text-xs text-gray-500">
            Scheduled auto {isPause ? 'pause' : 'cleanup'}
          </p>
          <p className="text-sm font-semibold text-gray-900">
            {autoCleanupEnabled ? 'Enabled' : 'Disabled'}
            {autoCleanupEnabled && request?.resourceCleanupIntervalHours
              ? ` · ${cleanupActionLabel.toLowerCase()} every ${request.resourceCleanupIntervalHours}h`
              : ''}
          </p>
        </div>
        <span
          className={`ml-auto inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
            autoCleanupEnabled
              ? isPause
                ? 'bg-amber-100 text-amber-800'
                : 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          {autoCleanupEnabled ? `${autoActionLabel} active` : 'Manual only'}
        </span>
      </div>

      <div className="space-y-2.5">
        {users.map((user) => {
          const busy = saving && busyUserId === user.id;
          const cleanupDisabled = user.cleanupDisabled === true;

          return (
            <div
              key={user.id}
              className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3.5"
            >
              <div className="min-w-[160px] flex-1">
                <span className="block text-sm font-semibold text-gray-900">{user.username}</span>
                <span className="font-mono text-[11px] text-gray-400">
                  {user.resourceGroup || '—'}
                </span>
              </div>

              <div>
                {cleanupDisabled ? (
                  <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                    {isPause ? 'Auto pause disabled' : 'Cleanup disabled'}
                  </span>
                ) : (
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      isPause ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {autoActionLabel} active
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={!cleanupDisabled}
                    disabled={busy}
                    onChange={(event) => void handleToggle(user.id, !event.target.checked)}
                  />
                  <span
                    className={`relative h-5 w-9 rounded-full transition ${cleanupDisabled ? 'bg-gray-300' : isPause ? 'bg-amber-500' : 'bg-green-500'}`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${cleanupDisabled ? 'left-0.5' : 'left-[18px]'}`}
                    />
                  </span>
                  <span className="text-xs text-gray-600">{cleanupDisabled ? 'Enable' : 'Disable'}</span>
                </label>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleCleanup(user.id)}
                  className={`inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                    isPause
                      ? 'border-amber-200 text-amber-800 hover:bg-amber-50'
                      : 'border-red-200 text-red-700 hover:bg-red-50'
                  }`}
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : isPause ? (
                    <Pause className="h-3.5 w-3.5" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  {isPause ? 'Pause now' : 'Delete now'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
