'use client';

import { Users } from 'lucide-react';
import { TableSkeleton } from '../../../../components/dashboard/LoadingSkeleton';
import UserRow from './UserRow';

export default function UsersTable({
  requestId,
  jwtToken,
  portalData,
  loading,
  onRefresh,
  onFeedback,
}) {
  const users = portalData?.consoleUrls || [];

  if (loading) {
    return (
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <div className="h-4 w-40 animate-pulse rounded bg-gray-200" />
        </div>
        <TableSkeleton rows={5} cols={9} embedded />
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-6 py-16 text-center shadow-sm">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-400">
          <Users className="h-6 w-6" />
        </div>
        <h3 className="text-base font-semibold text-gray-900">No provisioned users</h3>
        <p className="mt-1 max-w-sm text-sm text-gray-500">
          Users will appear here once provisioning completes for this request.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-6 py-4">
        <h2 className="text-sm font-semibold text-gray-900">Provisioned Users</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          Click Launch to get AWS console access. Budget and cleanup controls are admin-only.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3 font-medium">Username</th>
              <th className="px-4 py-3 font-medium">IAM Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Permissions</th>
              <th className="px-4 py-3 font-medium">Expiry</th>
              <th className="px-4 py-3 font-medium">Console</th>
              <th className="px-4 py-3 font-medium">Session</th>
              <th className="px-4 py-3 font-medium">Budget &amp; Cleanup</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <UserRow
                key={user.userIndex}
                user={user}
                requestId={requestId}
                jwtToken={jwtToken}
                portalData={portalData}
                onRefresh={onRefresh}
                onFeedback={onFeedback}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
