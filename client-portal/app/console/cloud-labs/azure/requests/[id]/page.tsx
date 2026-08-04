'use client';

import { RequestStatusView } from '../../../../../../cloud_automation/components/create-request/RequestStatusView';
import { CLOUD_LABS_ROUTES } from '../../../../../../cloud_automation_training/constants';

interface PageProps {
  params: { id: string };
}

export default function AzureLabsRequestStatusPage({ params }: PageProps) {
  const requestId = Number(params.id);

  if (!Number.isInteger(requestId) || requestId <= 0) {
    return (
      <RequestStatusView
        requestId={0}
        backHref={CLOUD_LABS_ROUTES.azureDashboard}
        backLabel="Back to Azure Labs"
        labsMode
      />
    );
  }

  return (
    <RequestStatusView
      requestId={requestId}
      backHref={CLOUD_LABS_ROUTES.azureDashboard}
      backLabel="Back to Azure Labs"
      labsMode
    />
  );
}
