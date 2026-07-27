'use client';

import { Suspense } from 'react';
import { RequestWorkspace } from '../../../../../cloud_automation/components/create-request/RequestWorkspace';
import { TableSkeleton } from '../../../../../components/dashboard/LoadingSkeleton';

export default function CreateRequestPage() {
  return (
    <Suspense
      fallback={
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <TableSkeleton rows={6} cols={1} embedded />
        </div>
      }
    >
      <RequestWorkspace />
    </Suspense>
  );
}
