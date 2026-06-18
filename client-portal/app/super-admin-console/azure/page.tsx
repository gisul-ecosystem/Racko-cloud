'use client';

import { Cloud } from 'lucide-react';

export default function SuperAdminAzurePage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50">
        <Cloud className="h-8 w-8 text-[#B91C1C]" />
      </div>
      <h1 className="text-xl font-bold text-gray-900">Azure Service Management</h1>
      <p className="mt-2 max-w-sm text-sm text-gray-500">
        Azure cloud service management for super admins is coming soon.
      </p>
    </div>
  );
}
