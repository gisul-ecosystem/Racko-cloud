import { DocPage, DocSection, DocNote, DocWarning } from '../../../../../components/console/DocPage';

const statusRows = [
  { status: 'Pending', description: 'Request is queued and waiting to start provisioning.' },
  { status: 'Provisioning', description: 'Azure resources and access are being created.' },
  { status: 'Completed', description: 'All steps finished. Lab users can access their environment.' },
  { status: 'Failed', description: 'A provisioning step failed. Review the orchestration log for details.' },
  { status: 'Expired', description: 'The lab end date has passed. Access has been revoked.' },
];

const provisionSteps = [
  { step: 'Resource Group Creating', description: 'Azure resource group is being created for the lab.' },
  { step: 'Setting Instance Policies', description: 'Instance-level policies and quotas are applied.' },
  { step: 'Users Creating', description: 'Azure AD users are created for each lab account.' },
  { step: 'Assigning Access', description: 'Azure RBAC roles are assigned to each user.' },
  { step: 'Sending Access Link', description: 'Access instructions are emailed to the customer.' },
];

export default function AzureRequestStatusPage() {
  return (
    <DocPage
      title="Azure Request Status"
      subtitle="Track live provisioning, review orchestration events, and manage lab access."
    >
      <DocSection title="Opening a request">
        <p>
          From the Azure Services dashboard, click any row in the Recent requests table to open
          its live provisioning page. You can also find requests in the Recent resources section
          on the main console page.
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
          The live provisioning page shows five orchestration steps. Each step moves through
          pending, active, complete, or failed states. A progress bar shows overall completion
          percentage. The page refreshes automatically while provisioning is in progress.
        </p>
        <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Step
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Description
                </th>
              </tr>
            </thead>
            <tbody>
              {provisionSteps.map((row) => (
                <tr key={row.step} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-3 font-medium text-gray-900">{row.step}</td>
                  <td className="px-4 py-3 text-gray-500">{row.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DocSection>

      <DocSection title="Orchestration events">
        <p>
          The events log on the status page shows a timestamped feed of provisioning activity.
          Success, info, and error events help diagnose issues if a step fails. Click Refresh
          to pull the latest updates manually.
        </p>
      </DocSection>

      <DocSection title="Request summary">
        <p>
          After provisioning completes, the summary section shows the customer email, Azure
          location, account count, estimated price, and resource group name. Use this to confirm
          the lab was configured correctly.
        </p>
        <DocNote>
          Lab users access Azure through the manage portal link sent to the customer email after
          the Sending Access Link step completes.
        </DocNote>
      </DocSection>

      <DocSection title="Handling failures">
        <p>
          If a step fails, the status page highlights the failed step and shows the error in the
          orchestration events log. Review the error message, fix any underlying configuration
          issues, and contact your administrator if the problem persists.
        </p>
        <DocWarning>
          Failed requests may leave partially created Azure resources. Your administrator can
          clean these up through Org Admin.
        </DocWarning>
      </DocSection>
    </DocPage>
  );
}
