import { DocPage, DocSection, DocNote, DocWarning } from '../../../../../components/console/DocPage';

const statusRows = [
  { status: 'Pending', description: 'Request is queued and waiting to start provisioning.' },
  { status: 'Provisioning', description: 'AWS resources and access are being created.' },
  { status: 'Completed', description: 'All steps finished. Lab users can access their environment.' },
  { status: 'Failed', description: 'A provisioning step failed. Use Retry provisioning to attempt again.' },
  { status: 'Expired', description: 'The lab end date has passed. Access has been revoked.' },
];

export default function AwsRequestStatusPage() {
  return (
    <DocPage
      title="AWS Request Status"
      subtitle="Track provisioning progress, manage lab users, and monitor spend."
    >
      <DocSection title="Opening a request">
        <p>
          From the AWS Services dashboard, click any row in the Recent requests table to open its
          status page. You can also find requests in the Recent resources section on the main
          console page.
        </p>
      </DocSection>

      <DocSection title="Status reference">
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Meaning
                </th>
              </tr>
            </thead>
            <tbody>
              {statusRows.map((row) => (
                <tr key={row.status} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-3 font-medium text-gray-900">{row.status}</td>
                  <td className="px-4 py-3 text-gray-500">{row.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DocSection>

      <DocSection title="Provisioning steps">
        <p>
          The status page shows a step-by-step progress tracker. Each step moves through pending,
          in progress, completed, or failed states. A progress bar and percentage indicate overall
          completion. The page refreshes automatically while provisioning is active.
        </p>
      </DocSection>

      <DocSection title="Lab users">
        <p>
          After provisioning completes, the Lab users table lists each provisioned user with their
          IAM role name and active or suspended status. Lab users access AWS through the manage
          portal link sent to the customer email.
        </p>
        <DocNote>
          Use the manage portal to generate AWS console magic links for individual lab users.
        </DocNote>
      </DocSection>

      <DocSection title="Per-user spend">
        <p>
          Once provisioning is complete, the Per-user spend section shows today&apos;s AWS spend
          per lab user, budget limits, and top services by cost. Spend data syncs from AWS Cost
          Explorer every 24 hours. Click Sync spend now to pull the latest data immediately.
        </p>
        <p>
          Users who exceed their budget are automatically suspended. Click Reinstate on a
          suspended user to restore their access after reviewing spend.
        </p>
        <DocWarning>
          Spend data may lag behind real-time usage by up to 24 hours unless you manually sync.
        </DocWarning>
      </DocSection>

      <DocSection title="Retrying failed requests">
        <p>
          If provisioning fails, the status page shows the failure reason and a Retry
          provisioning button. Click it to re-run the failed provisioning workflow without
          creating a new request.
        </p>
      </DocSection>
    </DocPage>
  );
}
