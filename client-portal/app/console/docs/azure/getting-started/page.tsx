import { DocPage, DocSection, DocSteps, DocNote } from '../../../../../components/console/DocPage';

export default function AzureGettingStartedPage() {
  return (
    <DocPage
      title="Getting Started with Azure Services"
      subtitle="Provision Azure lab environments and manage access for your users."
    >
      <DocSection title="What is Azure Services?">
        <p>
          Racko Azure Services automates the provisioning of Azure lab environments for training,
          demos, and hands-on learning. You create a provisioning request, Racko sets up Azure
          resource groups with the services and role assignments you specify, and lab users receive
          secure access instructions.
        </p>
        <p>
          Each request can include multiple lab users, selected Azure services, role assignments,
          optional daily usage windows, budget limits, and automatic resource cleanup.
        </p>
        <DocNote>
          Azure Services handles access provisioning and lifecycle management. You are billed for
          actual Azure usage through your configured Azure subscription.
        </DocNote>
      </DocSection>

      <DocSection title="What you need before you start">
        <ul className="ml-4 list-disc space-y-2 text-gray-600">
          <li>An admin account with access to the Racko console</li>
          <li>The customer or lab owner&apos;s email address</li>
          <li>The number of lab users (accounts) required</li>
          <li>Start and end dates for the lab environment</li>
        </ul>
      </DocSection>

      <DocSection title="Creating your first request">
        <DocSteps
          steps={[
            {
              title: 'Go to Azure Services',
              description:
                'From the Racko console, click "Azure Services" to open the dashboard.',
            },
            {
              title: 'Click Create Request',
              description:
                'Use the Create Request button in the dashboard header to open the request builder.',
            },
            {
              title: 'Fill in the request form',
              description:
                'Enter customer details, select services and instances, assign Azure roles, choose a location, and configure optional usage windows, cleanup, and budget settings.',
            },
            {
              title: 'Review pricing and submit',
              description:
                'The pricing summary shows your estimated cost. Submit the request to start provisioning.',
            },
            {
              title: 'Track live provisioning',
              description:
                'You are redirected to the live provisioning page where you can watch each step complete in real time.',
            },
          ]}
        />
      </DocSection>

      <DocSection title="How long does provisioning take?">
        <p>
          Most requests complete within a few minutes. The live provisioning page polls for updates
          every few seconds and shows a progress bar with step-by-step status until all steps are
          complete.
        </p>
      </DocSection>

      <DocSection title="After provisioning completes">
        <p>
          Once all provisioning steps finish, lab users receive access instructions by email.
          You can review the request summary, provisioned users, and orchestration events on the
          request status page.
        </p>
      </DocSection>
    </DocPage>
  );
}
