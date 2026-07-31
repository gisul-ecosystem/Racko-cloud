'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Shield } from 'lucide-react';
import {
  assignAwsOrgPrivilegedRoleToAllUsers,
  listAwsOrgPrivilegedRoleRequests,
  listAwsOrgPrivilegedRoles,
  reviewAwsOrgPrivilegedRoleRequest,
} from '../../api/orgAdminClient';
import type {
  AwsOrgAdminPrivilegedRoleRequest,
  AwsOrgAdminUser,
  AwsPrivilegedRoleOption,
} from '../../types/orgAdmin';

interface AwsOrgAdminPrivilegedRolesTabProps {
  requestId: string;
  users: AwsOrgAdminUser[];
  onAssigned?: () => void;
}

type BannerState = { type: 'success' | 'error'; message: string } | null;

export function AwsOrgAdminPrivilegedRolesTab({
  requestId,
  users,
  onAssigned,
}: AwsOrgAdminPrivilegedRolesTabProps) {
  const [privilegedRoles, setPrivilegedRoles] = useState<AwsPrivilegedRoleOption[]>([]);
  const [pendingRequests, setPendingRequests] = useState<AwsOrgAdminPrivilegedRoleRequest[]>([]);
  const [selectedRole, setSelectedRole] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<BannerState>(null);

  const eligibleUsers = users.filter(
    (user) => user.status !== 'Deleted' && Boolean(user.username || user.roleName)
  );

  const loadData = useCallback(async () => {
    try {
      const [roles, pending] = await Promise.all([
        listAwsOrgPrivilegedRoles(),
        listAwsOrgPrivilegedRoleRequests({ status: 'pending', requestId }),
      ]);

      setPrivilegedRoles(roles);
      setPendingRequests(pending);
      setSelectedRole((current) => current || roles[0]?.name || '');
    } catch (error) {
      console.error('Failed to load privileged roles:', error);
    }
  }, [requestId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const showBanner = (type: 'success' | 'error', message: string) => {
    setBanner({ type, message });
    window.setTimeout(() => setBanner(null), 4000);
  };

  async function handleAssignAll() {
    if (!selectedRole) {
      showBanner('error', 'Select a privileged role.');
      return;
    }

    if (eligibleUsers.length === 0) {
      showBanner('error', 'No provisioned users available for assignment.');
      return;
    }

    setAssigning(true);
    try {
      const result = await assignAwsOrgPrivilegedRoleToAllUsers(requestId, selectedRole);
      showBanner('success', result.message || `${selectedRole} assigned to all users.`);
      onAssigned?.();
    } catch (error) {
      showBanner(
        'error',
        error instanceof Error ? error.message : 'Failed to assign privileged role.'
      );
    } finally {
      setAssigning(false);
    }
  }

  async function handleReview(id: string, status: 'approved' | 'rejected') {
    setReviewingId(id);
    try {
      await reviewAwsOrgPrivilegedRoleRequest(id, { status });
      showBanner(
        'success',
        status === 'approved'
          ? 'Privileged role request approved. Access applies when the lab is ready.'
          : 'Privileged role request rejected.'
      );
      await loadData();
      onAssigned?.();
    } catch (error) {
      showBanner(
        'error',
        error instanceof Error ? error.message : 'Failed to review privileged role request.'
      );
    } finally {
      setReviewingId(null);
    }
  }

  return (
    <div className="space-y-6 p-5">
      {banner && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            banner.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {banner.message}
        </div>
      )}

      {pendingRequests.length > 0 && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Shield className="h-4 w-4 text-violet-700" />
            <h3 className="text-sm font-semibold text-violet-900">
              Pending requests for this lab ({pendingRequests.length})
            </h3>
          </div>
          <ul className="space-y-3">
            {pendingRequests.map((request) => (
              <li
                key={request.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-violet-100 bg-white px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{request.awsRole}</p>
                  <p className="text-xs text-gray-500">{request.customerEmail}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={reviewingId === request.id}
                    onClick={() => void handleReview(request.id, 'approved')}
                    className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {reviewingId === request.id ? 'Working…' : 'Approve'}
                  </button>
                  <button
                    type="button"
                    disabled={reviewingId === request.id}
                    onClick={() => void handleReview(request.id, 'rejected')}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900">Manual privileged role assignment</h3>
        <p className="mt-1 text-xs text-gray-500">
          Attach a managed privileged IAM pack to all {eligibleUsers.length} provisioned user(s) in
          this lab. AdministratorAccess is not available.
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label
              htmlFor="aws-privileged-role-select"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500"
            >
              Privileged role
            </label>
            <select
              id="aws-privileged-role-select"
              value={selectedRole}
              onChange={(event) => setSelectedRole(event.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C]"
            >
              <option value="">Select a role</option>
              {privilegedRoles.map((role) => (
                <option key={role.key} value={role.name}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={assigning || !selectedRole || eligibleUsers.length === 0}
            onClick={() => void handleAssignAll()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {assigning ? 'Assigning…' : 'Assign to all users'}
          </button>
        </div>
      </div>
    </div>
  );
}
