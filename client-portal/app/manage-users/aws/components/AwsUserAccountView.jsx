'use client';

import { ExternalLink } from 'lucide-react';
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

export default function AwsUserAccountView({
  user,
  requestId,
  jwtToken,
  portalData,
  onFeedback,
}) {
  const allowedServices = portalData.allowedServices || [];
  const expiryDate = portalData.endDate
    ? new Date(portalData.endDate).toISOString().split('T')[0]
    : '—';
  const isIdentityCenter = portalData.accessType === 'identity_center';

  return (
    <div className="mx-auto max-w-2xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-6 py-4">
        <h2 className="text-sm font-semibold text-gray-900">My Account</h2>
        <p className="mt-0.5 text-xs text-gray-500">Your provisioned AWS lab account status</p>
      </div>

      <div className="space-y-5 p-6">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Username</dt>
            <dd className="mt-1 text-sm font-semibold text-gray-900">{user.username}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Status</dt>
            <dd className="mt-1">
              <StatusBadge
                suspended={user.suspended}
                servicePeriodBlocked={user.servicePeriodBlocked}
              />
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">IAM Role</dt>
            <dd className="mt-1 break-all font-mono text-xs text-gray-700">{user.roleName || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Access expiry</dt>
            <dd className="mt-1 text-sm text-gray-900">{expiryDate}</dd>
          </div>
        </dl>

        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Permissions</dt>
          <dd className="mt-2 flex flex-wrap gap-1.5">
            {(allowedServices.length > 0 ? allowedServices : ['ReadOnly']).map((service) => (
              <span
                key={service}
                className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-700"
              >
                {service}
              </span>
            ))}
          </dd>
        </div>

        {user.servicePeriodBlocked && user.servicePeriodMessage ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {user.servicePeriodMessage}
          </div>
        ) : null}

        <div>
          <dt className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">AWS Console</dt>
          {isIdentityCenter ? (
            user.suspended || user.servicePeriodBlocked ? (
              <span className="text-sm text-gray-400">Access blocked</span>
            ) : user.consoleUrl ? (
              <div className="space-y-2">
                <a
                  href={user.consoleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--cloud-accent,#B91C1C)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[color-mix(in_srgb,var(--cloud-accent,#B91C1C)_88%,black)]"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open AWS Console
                </a>
                {user.password ? (
                  <p className="font-mono text-xs text-gray-500">
                    {user.username} / {user.password}
                  </p>
                ) : null}
              </div>
            ) : (
              <span className="text-sm text-gray-400">No console URL available</span>
            )
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
        </div>

        <div>
          <dt className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Session</dt>
          <SessionInfo requestId={requestId} userIndex={user.userIndex} jwtToken={jwtToken} />
        </div>
      </div>
    </div>
  );
}
