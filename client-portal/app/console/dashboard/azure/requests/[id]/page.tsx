'use client';

import { useParams } from 'next/navigation';
import { RequestStatusView } from '@/cloud_automation/components/create-request/RequestStatusView';
import { useAzureRoutes } from '@/lib/cloudPortalRoutes';

export default function TenantAzureRequestStatusPage() {
  const params = useParams();
  const AZURE_ROUTES = useAzureRoutes();
  const requestId = Number(params.id);

  return (
    <RequestStatusView
      requestId={Number.isInteger(requestId) && requestId > 0 ? requestId : 0}
      backHref={AZURE_ROUTES.dashboard}
      backLabel="Back to overview"
    />
  );
}
