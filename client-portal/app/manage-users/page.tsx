'use client';

import { Suspense } from 'react';
import { ManageUsersPortal } from '../../cloud_automation/components/manage-users/ManageUsersPortal';

function ManageUsersFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-[#B91C1C]" />
    </div>
  );
}

export default function ManageUsersPage() {
  return (
    <Suspense fallback={<ManageUsersFallback />}>
      <ManageUsersPortal />
    </Suspense>
  );
}
