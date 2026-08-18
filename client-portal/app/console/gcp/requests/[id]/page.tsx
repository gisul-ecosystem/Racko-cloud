'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { GcpRequestStatusView } from '@/cloud_automation_gcp/components/create-request/GcpRequestStatusView';

function StatusFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-[var(--cloud-accent,#B91C1C)]" />
    </div>
  );
}

function GcpRequestStatusContent() {
  const params = useParams();
  const requestId = String(params?.id || '');

  return <GcpRequestStatusView requestId={requestId} />;
}

export default function GcpRequestStatusPage() {
  return (
    <Suspense fallback={<StatusFallback />}>
      <GcpRequestStatusContent />
    </Suspense>
  );
}
