'use client';

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { formatCurrency, formatDateTime, formatMinutes } from '../../utils/formatters';
import type {
  OrgAdminMonitoringResponse,
  OrgAdminRequestDetail,
  OrgAdminUser,
} from '../../types/orgAdmin';

interface OrgAdminUserUsageModalProps {
  user: OrgAdminUser;
  request: OrgAdminRequestDetail;
  fetchMonitoring: () => Promise<OrgAdminMonitoringResponse | null>;
  onClose: () => void;
}

export function OrgAdminUserUsageModal({
  user,
  request,
  fetchMonitoring,
  onClose,
}: OrgAdminUserUsageModalProps) {
  const [loading, setLoading] = useState(true);
  const [monitoring, setMonitoring] = useState<OrgAdminMonitoringResponse | null>(null);

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
  const liveResources = request.liveSummary?.resources ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-gray-200 bg-white shadow-xl"
        role="dialog"
        aria-labelledby="user-usage-title"
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 id="user-usage-title" className="text-base font-semibold text-gray-900">
              Live usage
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
              <p className="text-xs text-gray-500">Resources</p>
              <p className="mt-0.5 font-semibold text-gray-900">{user.resourceCount ?? 0}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
              <p className="text-xs text-gray-500">Time spent</p>
              <p className="mt-0.5 font-semibold text-gray-900">
                {formatMinutes(user.totalMinutesSpent ?? 0)}
              </p>
              {user.hasActiveSession && (user.activeSessionMinutes ?? 0) > 0 && (
                <p className="mt-0.5 text-xs text-green-700">
                  +{formatMinutes(user.activeSessionMinutes)} live
                </p>
              )}
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
              <p className="text-xs text-gray-500">Hourly rate</p>
              <p className="mt-0.5 font-semibold text-gray-900">
                {formatCurrency(user.hourlyResourceRate ?? 0)}
              </p>
            </div>
            <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2.5">
              <p className="text-xs text-violet-700">Live cost</p>
              <p className="mt-0.5 font-semibold text-violet-900">
                {formatCurrency(user.liveCost ?? 0)}
              </p>
            </div>
          </div>

          {user.enableDailyUsage && (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                <p className="text-xs text-gray-500">Used today</p>
                <p className="mt-0.5 font-semibold text-gray-900">
                  {formatMinutes(user.usedTodayMinutes ?? user.todayMinutes ?? 0)}
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
                  {formatMinutes(user.dailyLimitMinutes ?? 0)}
                </p>
              </div>
            </div>
          )}

          {user.hasActiveSession && user.sessionExpiresAt && (
            <p className="text-xs text-amber-700">
              Session auto-ends when daily limit is reached (~
              {formatMinutes(
                Math.max(
                  0,
                  Math.round((new Date(user.sessionExpiresAt).getTime() - Date.now()) / 60000)
                )
              )}{' '}
              remaining today).
            </p>
          )}

          {liveResources.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-900">Provisioned resources</h4>
              <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-100">
                {liveResources.map((resource) => (
                  <li
                    key={`${resource.serviceId}-${resource.resourceName}`}
                    className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{resource.name}</p>
                      <p className="text-xs text-gray-500">
                        {resource.resourceType}
                        {resource.instanceOption ? ` · ${resource.instanceOption}` : ''}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-gray-700">
                      {formatCurrency(resource.hourlyRate)}/hr
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-gray-500">
                Live cost = hourly retail rate × actual session hours logged for this user.
              </p>
            </div>
          )}

          <div className="text-xs text-gray-500">
            <p>Last login: {formatDateTime(user.lastLoginAt)}</p>
            {user.blockedUntil && (
              <p className="mt-1 text-amber-700">Blocked until: {formatDateTime(user.blockedUntil)}</p>
            )}
          </div>

          <div>
            <h4 className="text-sm font-semibold text-gray-900">Session history</h4>
            {loading ? (
              <div className="mt-3 flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : sessions.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">No session history recorded.</p>
            ) : (
              <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-100">
                {sessions.map((session) => (
                  <li key={session.id} className="px-3 py-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-gray-900">{formatDateTime(session.loginAt)}</span>
                      {session.isActive ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          Active · {formatMinutes(session.currentSessionMinutes)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500">
                          {formatMinutes(session.minutesUsed)}
                        </span>
                      )}
                    </div>
                    {session.logoutAt && (
                      <p className="mt-0.5 text-xs text-gray-400">
                        Ended {formatDateTime(session.logoutAt)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="border-t border-gray-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#a01717]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
