'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Pause, Trash2 } from 'lucide-react';
import { getOrgCleanupLogs } from '../../api/orgAdminClient';
import type { OrgAdminCleanupLog, OrgAdminRequestDetail, OrgAdminUser } from '../../types/orgAdmin';
import { formatCleanupTimeLabel } from '../../utils/requestForm';

interface OrgAdminCleanupTabProps {
  users: OrgAdminUser[];
  request: OrgAdminRequestDetail | null;
  requestId: number;
  saving: boolean;
  onToggleCleanup: (userId: number, disabled: boolean) => Promise<boolean>;
  onManualCleanup: (userId: number) => Promise<boolean>;
  onRequestCleanup?: () => Promise<boolean>;
}

function formatTriggeredBy(triggeredBy: string): string {
  const map: Record<string, string> = {
    scheduler: 'Scheduler',
    admin_manual: 'Admin (manual)',
    manual: 'Admin (manual)',
  };
  return map[triggeredBy] || triggeredBy;
}

export function OrgAdminCleanupTab({
  users,
  request,
  requestId,
  saving,
  onToggleCleanup,
  onManualCleanup,
  onRequestCleanup,
}: OrgAdminCleanupTabProps) {
  const [busyUserId, setBusyUserId] = useState<number | null>(null);
  const [requestCleanupRunning, setRequestCleanupRunning] = useState(false);
  const [cleanupLogs, setCleanupLogs] = useState<OrgAdminCleanupLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [lastCleanupResult, setLastCleanupResult] = useState<string | null>(null);

  const autoCleanupEnabled = request?.resourceCleanupEnabled === true;
  const cleanupAction = request?.resourceCleanupAction === 'pause' ? 'pause' : 'delete';
  const isPause = cleanupAction === 'pause';
  const cleanupActionLabel = isPause ? 'Pause' : 'Delete';
  const autoActionLabel = isPause ? 'Auto pause' : 'Auto cleanup';

  const loadCleanupLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const response = await getOrgCleanupLogs(requestId);
      if (response.success) {
        setCleanupLogs(response.logs);
      }
    } catch {
      // Non-blocking.
    } finally {
      setLogsLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    void loadCleanupLogs();
  }, [loadCleanupLogs]);

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
    setLastCleanupResult(null);
    try {
      const ok = await onManualCleanup(userId);
      if (ok) {
        setLastCleanupResult('Per-user cleanup completed.');
        await loadCleanupLogs();
      }
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleRequestCleanup() {
    if (!onRequestCleanup) return;
    if (
      !window.confirm(
        isPause
          ? 'Pause all Azure resources for every user in this request right now?'
          : 'Delete all Azure resources for every user in this request right now?'
      )
    ) {
      return;
    }

    setRequestCleanupRunning(true);
    setLastCleanupResult(null);
    try {
      const ok = await onRequestCleanup();
      if (ok) {
        setLastCleanupResult('Request-wide cleanup completed.');
        await loadCleanupLogs();
      }
    } finally {
      setRequestCleanupRunning(false);
    }
  }

  const lastLog = cleanupLogs[0];
  const cleanupTime = request?.resourceCleanupTime;
  const cleanupTimezone = request?.resourceCleanupTimezone;
  const intervalHours = request?.resourceCleanupIntervalHours;
  const cleanupScheduleLabel =
    autoCleanupEnabled && cleanupTime
      ? `Daily at ${formatCleanupTimeLabel(cleanupTime)}${
          cleanupTimezone ? ` (${cleanupTimezone.replace(/_/g, ' ')})` : ''
        }`
      : autoCleanupEnabled && intervalHours
        ? `Every ${intervalHours} hours`
        : 'Not scheduled';

  if (users.length === 0) {
    return (
      <div className="px-6 py-10 text-center text-sm text-gray-500">No users in this request.</div>
    );
  }

  return (
    <div className="space-y-5 px-6 py-5">
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
            ? 'Pauses Azure resources created by each user inside their resource group.'
            : 'Deletes Azure resources created by each user inside their resource group.'}{' '}
          RBAC role assignments are preserved so users can recreate resources after cleanup.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3.5">
          <p className="text-xs text-gray-500">Cleanup schedule</p>
          <p className="text-sm font-semibold text-gray-900">{cleanupScheduleLabel}</p>
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3.5">
          <p className="text-xs text-gray-500">Next scheduled run</p>
          <p className="text-sm font-semibold text-gray-900">
            {request?.resourceCleanupNextRunAt
              ? new Date(request.resourceCleanupNextRunAt).toLocaleString()
              : '—'}
          </p>
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3.5">
          <p className="text-xs text-gray-500">Last run</p>
          <p className="text-sm font-semibold text-gray-900">
            {request?.resourceCleanupLastRanAt
              ? `${new Date(request.resourceCleanupLastRanAt).toLocaleString()}`
              : lastLog
                ? new Date(lastLog.ranAt).toLocaleString()
                : '—'}
          </p>
          {(lastLog || request?.resourceCleanupLastRanAt) && (
            <p className="text-[11px] text-gray-500">
              {lastLog ? `${lastLog.totalDeleted} resources deleted` : 'See history below'}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3.5">
        <div>
          <p className="text-xs text-gray-500">Scheduled auto {isPause ? 'pause' : 'cleanup'}</p>
          <p className="text-sm font-semibold text-gray-900">
            {autoCleanupEnabled ? 'Enabled' : 'Disabled'}
            {autoCleanupEnabled && cleanupTime
              ? ` · daily at ${formatCleanupTimeLabel(cleanupTime)}`
              : autoCleanupEnabled && intervalHours
                ? ` · every ${intervalHours}h`
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
        {onRequestCleanup && (
          <button
            type="button"
            disabled={saving || requestCleanupRunning}
            onClick={() => void handleRequestCleanup()}
            className={`inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
              isPause
                ? 'border-amber-200 text-amber-800 hover:bg-amber-50'
                : 'border-red-200 text-red-700 hover:bg-red-50'
            }`}
          >
            {requestCleanupRunning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : isPause ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            {requestCleanupRunning ? 'Deleting resources...' : 'Run Cleanup Now'}
          </button>
        )}
      </div>

      {lastCleanupResult && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800">
          {lastCleanupResult}
        </div>
      )}

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Cleanup history
        </h4>
        {logsLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading history...
          </div>
        ) : cleanupLogs.length === 0 ? (
          <p className="py-4 text-sm text-gray-400">No cleanup runs recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2.5 font-medium">Time</th>
                  <th className="px-4 py-2.5 font-medium">Triggered by</th>
                  <th className="px-4 py-2.5 font-medium">Resources deleted</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {cleanupLogs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2.5 text-gray-800">
                      {new Date(log.ranAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{formatTriggeredBy(log.triggeredBy)}</td>
                    <td className="px-4 py-2.5 text-gray-700">{log.totalDeleted}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          log.status === 'success'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {log.status === 'success' ? 'Success' : log.status || 'Failed'}
                      </span>
                      {log.error && (
                        <p className="mt-0.5 text-[10px] text-red-600" title={log.error}>
                          {log.error.slice(0, 60)}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Per-user settings
        </h4>
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
    </div>
  );
}
