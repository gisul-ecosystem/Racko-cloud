'use client';

import { useState } from 'react';
import {
  reinstateAwsLabUser,
  suspendAwsLabUser,
} from '../../../../cloud_automation_aws/api/managePortalClient';
import BudgetCleanupCell from './BudgetCleanupCell';
import LaunchConsoleButton from './LaunchConsoleButton';
import SessionInfo from './SessionInfo';

function StatusBadge({ suspended, servicePeriodBlocked }) {
  if (servicePeriodBlocked) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Not started
      </span>
    );
  }

  if (suspended) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
        <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
        Suspended
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
      <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
      Active
    </span>
  );
}

function truncateRole(name) {
  if (!name) return '—';
  if (name.length <= 24) return name;
  return `${name.slice(0, 21)}…`;
}

export default function UserRow({
  user,
  requestId,
  jwtToken,
  portalData,
  onRefresh,
  onFeedback,
}) {
  const [actionLoading, setActionLoading] = useState(false);
  const allowedServices = portalData.allowedServices || [];

  async function handleSuspend(event) {
    event.stopPropagation();
    if (!window.confirm(`Suspend ${user.username}?`)) return;

    setActionLoading(true);
    onFeedback?.(null);

    try {
      await suspendAwsLabUser(requestId, user.userIndex, jwtToken);
      onFeedback?.(`${user.username} suspended.`);
      onRefresh();
    } catch (err) {
      onFeedback?.(`Suspend failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReinstate(event) {
    event.stopPropagation();
    setActionLoading(true);
    onFeedback?.(null);

    try {
      await reinstateAwsLabUser(requestId, user.userIndex, jwtToken);
      onFeedback?.(`${user.username} reinstated.`);
      onRefresh();
    } catch (err) {
      onFeedback?.(`Reinstate failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  }

  const expiryDate = portalData.endDate
    ? new Date(portalData.endDate).toISOString().split('T')[0]
    : '—';
  const isIdentityCenter = portalData.accessType === 'identity_center';

  return (
    <tr className="border-b border-gray-50 transition hover:bg-gray-50">
      <td className="px-4 py-3 font-medium text-gray-900">
        <div>{user.username}</div>
        {isIdentityCenter ? (
          <span className="mt-1 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-800">
            🔐 Direct IAM Login
          </span>
        ) : (
          <span className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900">
            🔗 Magic Link
          </span>
        )}
      </td>

      <td className="px-4 py-3 font-mono text-xs text-gray-600" title={user.roleName}>
        {truncateRole(user.roleName)}
      </td>

      <td className="px-4 py-3">
        <div className="flex flex-col gap-2">
          <StatusBadge
            suspended={user.suspended}
            servicePeriodBlocked={user.servicePeriodBlocked}
          />
          {user.servicePeriodBlocked && user.servicePeriodMessage ? (
            <p className="max-w-[180px] text-[11px] leading-snug text-amber-700">
              {user.servicePeriodMessage}
            </p>
          ) : null}
          {user.suspended ? (
            <button
              type="button"
              onClick={handleReinstate}
              disabled={actionLoading}
              className="w-fit rounded border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700 transition hover:bg-green-100 disabled:opacity-50"
            >
              Reinstate
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSuspend}
              disabled={actionLoading}
              className="w-fit rounded border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
            >
              Suspend
            </button>
          )}
        </div>
      </td>

      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {(allowedServices.length > 0 ? allowedServices : ['ReadOnly']).map((service) => (
            <span
              key={service}
              className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700"
            >
              {service}
            </span>
          ))}
        </div>
      </td>

      <td className="px-4 py-3 text-gray-600">{expiryDate}</td>

      <td className="px-4 py-3">
        {isIdentityCenter ? (
          <div className="flex flex-col gap-1">
            {user.suspended || user.servicePeriodBlocked ? (
              <span className="text-xs text-gray-400">Access blocked</span>
            ) : user.consoleUrl ? (
              <>
                <a
                  href={user.consoleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-blue-700 underline"
                >
                  Open Console
                </a>
                {user.password ? (
                  <span className="font-mono text-[10px] text-gray-500" title="Console password">
                    {user.username} / {user.password}
                  </span>
                ) : null}
              </>
            ) : (
              <span className="text-xs text-gray-400">No console URL</span>
            )}
          </div>
        ) : (
          <LaunchConsoleButton
            requestId={requestId}
            userIndex={user.userIndex}
            jwtToken={jwtToken}
            suspended={user.suspended}
            servicePeriodBlocked={user.servicePeriodBlocked}
            servicePeriodMessage={user.servicePeriodMessage}
            onFeedback={onFeedback}
          />
        )}
      </td>

      <td className="px-4 py-3 align-top">
        <SessionInfo requestId={requestId} userIndex={user.userIndex} jwtToken={jwtToken} />
      </td>

      <td className="px-4 py-3 align-top">
        <BudgetCleanupCell
          requestId={requestId}
          userIndex={user.userIndex}
          jwtToken={jwtToken}
          user={user}
          portalData={portalData}
          onRefresh={onRefresh}
          onFeedback={onFeedback}
        />
      </td>
    </tr>
  );
}
