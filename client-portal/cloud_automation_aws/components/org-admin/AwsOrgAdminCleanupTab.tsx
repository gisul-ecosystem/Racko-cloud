'use client';

import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import type { AwsOrgAdminRequestDetail } from '../../types/orgAdmin';

interface AwsOrgAdminCleanupTabProps {
  detail: AwsOrgAdminRequestDetail;
  saving: boolean;
  onCleanup: (userIndex: number) => Promise<boolean>;
  onToggleCleanup: (enabled: boolean) => Promise<boolean>;
}

export function AwsOrgAdminCleanupTab({
  detail,
  saving,
  onCleanup,
  onToggleCleanup,
}: AwsOrgAdminCleanupTabProps) {
  const [busyUserIndex, setBusyUserIndex] = useState<number | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);

  async function handleCleanup(userIndex: number) {
    if (!window.confirm(`Delete all AWS resources for labuser${userIndex + 1}?`)) {
      return;
    }

    setBusyUserIndex(userIndex);
    try {
      await onCleanup(userIndex);
    } finally {
      setBusyUserIndex(null);
    }
  }

  async function handleToggle(enabled: boolean) {
    setToggleBusy(true);
    try {
      await onToggleCleanup(enabled);
    } finally {
      setToggleBusy(false);
    }
  }

  if (!detail.users?.length) {
    return (
      <div className="px-6 py-10 text-center text-sm text-gray-500">No users in this request.</div>
    );
  }

  return (
    <div className="space-y-4 px-2 py-2">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Resource Cleanup</h3>
        <p className="mt-1 text-xs text-gray-500">
          Deletes AWS resources created by each user. IAM roles are preserved so users can recreate
          resources after cleanup.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3.5">
        <div>
          <p className="text-xs text-gray-500">Auto cleanup</p>
          <p className="text-sm font-semibold text-gray-900">
            {detail.cleanupEnabled ? 'Enabled' : 'Disabled'}
            {detail.cleanupEnabled && detail.cleanupIntervalHours
              ? ` · every ${detail.cleanupIntervalHours}h`
              : ''}
          </p>
        </div>

        <label className="ml-auto flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="sr-only"
            checked={detail.cleanupEnabled}
            disabled={toggleBusy || saving}
            onChange={(event) => void handleToggle(event.target.checked)}
          />
          <span
            className={`relative h-5 w-9 rounded-full transition ${detail.cleanupEnabled ? 'bg-green-500' : 'bg-gray-300'}`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${detail.cleanupEnabled ? 'left-[18px]' : 'left-0.5'}`}
            />
          </span>
          <span className="text-xs text-gray-600">
            {detail.cleanupEnabled ? 'Disable' : 'Enable'}
          </span>
        </label>
      </div>

      <div className="space-y-2.5">
        {detail.users.map((user) => {
          const busy = saving && busyUserIndex === user.userIndex;
          const lastLog = user.cleanupLogs?.[user.cleanupLogs.length - 1];

          return (
            <div
              key={user.userIndex}
              className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3.5"
            >
              <div className="min-w-[160px] flex-1">
                <span className="block text-sm font-semibold text-gray-900">{user.username}</span>
                <span className="font-mono text-[11px] text-gray-400">{user.roleName || '—'}</span>
              </div>

              <div>
                {detail.cleanupEnabled ? (
                  <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                    Auto cleanup active
                  </span>
                ) : (
                  <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                    Cleanup disabled
                  </span>
                )}
              </div>

              <div className="min-w-[140px] text-xs text-gray-500">
                {user.lastCleanupAt
                  ? `Last: ${new Date(user.lastCleanupAt).toLocaleString()}`
                  : 'Never cleaned'}
              </div>

              <div className="min-w-[120px] text-xs text-gray-600">
                {lastLog?.results
                  ? Object.entries(lastLog.results)
                      .filter(([, value]) => {
                        const entry = value as { terminated?: number; deleted?: number };
                        return (entry.terminated || 0) > 0 || (entry.deleted || 0) > 0;
                      })
                      .map(([service, value]) => {
                        const entry = value as { terminated?: number; deleted?: number };
                        const count = entry.terminated || entry.deleted || 0;
                        return `${service}: ${count}`;
                      })
                      .join(', ') || '—'
                  : '—'}
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() => void handleCleanup(user.userIndex)}
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
          );
        })}
      </div>
    </div>
  );
}
