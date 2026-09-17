'use client';

import { useEffect, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { getGcpOrgCleanupLogs } from '../../api/orgAdminClient';
import type { GcpOrgAdminCleanupLog, GcpOrgAdminRequestDetail } from '../../types/orgAdmin';

interface GcpOrgAdminCleanupTabProps {
  detail: GcpOrgAdminRequestDetail;
  saving: boolean;
  onCleanup: (userIndex: number) => Promise<boolean>;
  onToggleCleanup: (userIndex: number, enabled: boolean) => Promise<boolean>;
  onRequestCleanup: () => Promise<boolean>;
  onRequestCleanupSettings: (
    settings: {
      cleanupEnabled?: boolean;
      cleanupIntervalHours?: number;
      action?: 'delete' | 'pause';
    }
  ) => Promise<boolean>;
}

export function GcpOrgAdminCleanupTab({
  detail,
  saving,
  onCleanup,
  onToggleCleanup,
  onRequestCleanup,
  onRequestCleanupSettings,
}: GcpOrgAdminCleanupTabProps) {
  const [busyUserIndex, setBusyUserIndex] = useState<number | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [logs, setLogs] = useState<GcpOrgAdminCleanupLog[]>([]);
  const [intervalHours, setIntervalHours] = useState(String(detail.cleanupIntervalHours || 2));

  useEffect(() => {
    void getGcpOrgCleanupLogs(detail.requestId).then(setLogs).catch(() => setLogs([]));
  }, [detail.requestId, detail.users]);

  async function handleCleanup(userIndex: number) {
    const action = detail.resourceCleanupAction === 'pause' ? 'Pause supported' : 'Delete all';
    if (!window.confirm(`${action} Gcp resources for labuser${userIndex + 1}?`)) {
      return;
    }

    setBusyUserIndex(userIndex);
    try {
      await onCleanup(userIndex);
    } finally {
      setBusyUserIndex(null);
    }
  }

  async function handleToggle(userIndex: number, enabled: boolean) {
    setToggleBusy(true);
    try {
      await onToggleCleanup(userIndex, enabled);
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Resource Cleanup</h3>
          <p className="mt-1 text-xs text-gray-500">
            Deletes resources or pauses supported EC2 and RDS workloads. IAM access is preserved.
          </p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => window.confirm(`${detail.resourceCleanupAction === 'pause' ? 'Pause supported' : 'Delete'} resources for every user in this Gcp request?`) && void onRequestCleanup()}
          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" /> Clean entire request
        </button>
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
            onChange={(event) => void onRequestCleanupSettings({ cleanupEnabled: event.target.checked })}
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

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-100 px-4 py-3">
        <label className="text-xs font-medium text-gray-600">
          Action
          <select
            value={detail.resourceCleanupAction || 'delete'}
            disabled={saving}
            onChange={(event) =>
              void onRequestCleanupSettings({
                action: event.target.value as 'delete' | 'pause',
              })
            }
            className="ml-2 rounded border bg-white px-2 py-1"
          >
            <option value="delete">Delete resources</option>
            <option value="pause">Pause supported resources</option>
          </select>
        </label>
        <label className="text-xs font-medium text-gray-600">
          Cleanup interval
          <select
            value={intervalHours}
            disabled={saving}
            onChange={(event) => setIntervalHours(event.target.value)}
            className="ml-2 rounded border bg-white px-2 py-1"
          >
            {[1, 2, 4, 6, 12, 24].map((hours) => (
              <option key={hours} value={hours}>Every {hours}h</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={saving}
          onClick={() => void onRequestCleanupSettings({ cleanupIntervalHours: Number(intervalHours) })}
          className="rounded-lg border bg-white px-3 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-50"
        >
          Save schedule
        </button>
        <span className="ml-auto text-xs text-gray-500">
          Last run: {detail.resourceCleanupLastRanAt ? new Date(detail.resourceCleanupLastRanAt).toLocaleString() : 'Never'}
          {' · '}Next: {detail.resourceCleanupNextRunAt ? new Date(detail.resourceCleanupNextRunAt).toLocaleString() : 'Not scheduled'}
        </span>
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
                {(user.cleanupEnabled ?? detail.cleanupEnabled) ? (
                  <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                    Auto cleanup active
                  </span>
                ) : (
                  <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                    Cleanup disabled
                  </span>
                )}
              </div>

              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={user.cleanupEnabled ?? detail.cleanupEnabled}
                  disabled={toggleBusy || saving}
                  onChange={(event) => void handleToggle(user.userIndex, event.target.checked)}
                />
                Per-user cleanup
              </label>

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

      <div className="overflow-hidden rounded-lg border">
        <div className="border-b bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900">Cleanup history</div>
        {logs.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-500">No cleanup runs recorded.</p>
        ) : (
          <div className="divide-y">
            {logs.map((log) => (
              <div key={log.id || log._id || log.ranAt} className="grid gap-2 px-4 py-3 text-xs md:grid-cols-5">
                <span>{new Date(log.ranAt).toLocaleString()}</span>
                <span>{log.userIndex == null ? 'All users' : `labuser${log.userIndex + 1}`}</span>
                <span>{log.triggeredBy || 'manual'}</span>
                <span>{log.totalDeleted || 0} removed</span>
                <span className={log.status === 'success' ? 'text-green-700' : 'text-red-700'}>
                  {log.error || log.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
