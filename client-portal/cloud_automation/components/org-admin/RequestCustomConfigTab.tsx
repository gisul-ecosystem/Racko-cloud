'use client';

import type { OrgAdminUser } from '../../types/orgAdmin';
import { CustomRolesTab } from './CustomRolesTab';
import { CustomServicesTab } from './CustomServicesTab';

interface RequestCustomConfigTabProps {
  requestId: number;
  users: OrgAdminUser[];
}

export function RequestCustomConfigTab({ requestId, users }: RequestCustomConfigTabProps) {
  const eligibleUsers = users.filter((user) => user.azureUserId);

  return (
    <div className="divide-y divide-gray-100">
      <CustomServicesTab requestId={requestId} userCount={eligibleUsers.length} />
      <CustomRolesTab requestId={requestId} users={users} />
    </div>
  );
}
