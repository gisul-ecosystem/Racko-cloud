'use client';

import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import type { OrgAdminUser } from '../../types/orgAdmin';

interface OrgAdminCleanupTabProps {
  users: OrgAdminUser[];
  requestId: number;
  saving: boolean;
  onToggleCleanup: (userId: number, disabled: boolean) => Promise<boolean>;
  onManualCleanup: (userId: number) => Promise<boolean>;
}

export function OrgAdminCleanupTab({
  users,
  saving,
  onToggleCleanup,
  onManualCleanup,
}: OrgAdminCleanupTabProps) {
  const [busyUserId, setBusyUserId] = useState<number | null>(null);

  async function handleToggle(userId: number, disabled: boolean) {
    setBusyUserId(userId);
    try {
      await onToggleCleanup(userId, disabled);
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleCleanup(userId: number) {
    if (!window.confirm("Delete all Azure resources inside this user's lab right now?")) {
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
    <div className="space-y-2.5 px-6 py-5">
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
                  Cleanup disabled
                </span>
              ) : (
                <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                  Auto cleanup active
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
                  className={`relative h-5 w-9 rounded-full transition ${cleanupDisabled ? 'bg-gray-300' : 'bg-green-500'}`}
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
                className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Clean now
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
