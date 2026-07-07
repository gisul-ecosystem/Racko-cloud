import { RequestStatusView } from '../../../cloud_automation/components/create-request/RequestStatusView';

import { AZURE_ROUTES } from '../../../cloud_automation/constants';



interface PageProps {

  params: { id: string };

}



export default function RequestStatusPage({ params }: PageProps) {

  const requestId = Number(params.id);



  if (!Number.isInteger(requestId) || requestId <= 0) {

    return (

      <RequestStatusView

        requestId={0}

        backHref={AZURE_ROUTES.createRequest}

        backLabel="Back to create request"

      />

    );

  }



  // Snapshot is loaded client-side only — see console/azure/requests/[id]/page.tsx.

  return (

    <RequestStatusView

      requestId={requestId}

      backHref={AZURE_ROUTES.createRequest}

      backLabel="Back to create request"

    />

  );

}

