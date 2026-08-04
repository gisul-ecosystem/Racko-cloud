'use client';

import { RequestStatusView } from '../../../../../../cloud_automation/components/create-request/RequestStatusView';
import { tenantConsole } from '@/lib/tenantAdminRoutes';

interface PageProps {
  params: { id: string };
}

export default function TenantAzureLabsRequestStatusPage({ params }: PageProps) {
  const requestId = Number(params.id);

  if (!Number.isInteger(requestId) || requestId <= 0) {
    return (
      <RequestStatusView
        requestId={0}
        backHref={tenantConsole.cloudLabsAzure}
        backLabel="Back to Azure Labs"
        labsMode
      />
    );
  }

  return (
    <RequestStatusView
      requestId={requestId}
      backHref={tenantConsole.cloudLabsAzure}
      backLabel="Back to Azure Labs"
      labsMode
    />
  );
}
