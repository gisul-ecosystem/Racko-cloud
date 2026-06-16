import { RequestStatusView } from '../../../../../cloud_automation/components/create-request/RequestStatusView';

import { AZURE_ROUTES } from '../../../../../cloud_automation/constants';



interface PageProps {

  params: { id: string };

}



export default function RequestStatusPage({ params }: PageProps) {

  const requestId = Number(params.id);



  if (!Number.isInteger(requestId) || requestId <= 0) {

    return (

      <RequestStatusView

        requestId={0}

        backHref={AZURE_ROUTES.dashboard}

        backLabel="Back to overview"

      />

    );

  }



  // Snapshot is loaded client-side only. Server-side refresh rotates the HttpOnly

  // refresh cookie without updating the browser, which invalidates the session.

  return (

    <RequestStatusView

      requestId={requestId}

      backHref={AZURE_ROUTES.dashboard}

      backLabel="Back to overview"

    />

  );

}

