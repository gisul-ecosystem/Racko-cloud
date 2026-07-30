'use client';

import { Suspense } from 'react';
import { RequestWorkspace } from '../../../../../cloud_automation_aws/components/create-request/RequestWorkspace';

export default function AwsCreateRequestPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-gray-500">Loading…</div>}>
      <RequestWorkspace />
    </Suspense>
  );
}
