'use client';

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { formatMinutes } from '../../api/orgAdminClient';
import type {
  AwsOrgAdminMonitoringResponse,
  AwsOrgAdminRequestDetail,
  AwsOrgAdminUser,
} from '../../types/orgAdmin';

interface AwsOrgAdminUserUsageModalProps {
  user: AwsOrgAdminUser;
  request: AwsOrgAdminRequestDetail;
  fetchMonitoring: () => Promise<AwsOrgAdminMonitoringResponse | null>;
  onClose: () => void;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

export function AwsOrgAdminUserUsageModal({
  user,
  request,
  fetchMonitoring,
  onClose,
}: AwsOrgAdminUserUsageModalProps) {
  const [loading, setLoading] = useState(true);
  const [monitoring, setMonitoring] = useState<AwsOrgAdminMonitoringResponse | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      setLoading(true);
      const result = await fetchMonitoring();
      if (active) {
        setMonitoring(result);
        setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [fetchMonitoring]);

  const sessions = monitoring?.usageSessions ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-gray-200 bg-white shadow-xl"
        role="dialog"
        aria-labelledby="aws-user-usage-title"
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 id="aws-user-usage-title" className="text-base font-semibold text-gray-900">
              Usage sessions
            </h3>
            <p className="mt-0.5 text-sm text-gray-500">{user.username}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
              <p className="text-xs text-gray-500">Time today</p>
              <p className="mt-0.5 font-semibold text-gray-900">
                {formatMinutes(user.todayMinutes ?? user.usedTodayMinutes ?? 0)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
              <p className="text-xs text-gray-500">Remaining</p>
              <p className="mt-0.5 font-semibold text-gray-900">
                {user.remainingMinutes != null ? formatMinutes(user.remainingMinutes) : '—'}
              </p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
              <p className="text-xs text-gray-500">Daily limit</p>
              <p className="mt-0.5 font-semibold text-gray-900">
                {user.dailyLimitHours != null ? `${user.dailyLimitHours}h/day` : '—'}
              </p>
            </div>
          </div>

          {request.enableDailyUsage && request.todayWindow && (
            <p className="text-xs text-gray-500">
              Today&apos;s window: {request.todayWindow.start.slice(0, 5)} –{' '}
              {request.todayWindow.end.slice(0, 5)} ({request.timezone})
            </p>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading session history...
            </div>
          ) : sessions.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No sessions recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {sessions.map((session) => (
                <li
                  key={session.id}
                  className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-gray-900">
                      {formatDateTime(session.loginAt)}
                    </span>
                    {session.isActive ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">
                        Active
                        {session.currentSessionMinutes != null
                          ? ` · ${formatMinutes(session.currentSessionMinutes)}`
                          : ''}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500">
                        {session.minutesUsed != null
                          ? formatMinutes(session.minutesUsed)
                          : 'Ended'}
                      </span>
                    )}
                  </div>
                  {session.logoutAt && (
                    <p className="mt-1 text-xs text-gray-500">
                      Ended {formatDateTime(session.logoutAt)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
