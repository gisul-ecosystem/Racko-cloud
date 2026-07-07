import { DocPage, DocSection, DocSteps, DocNote } from '../../../../../components/console/DocPage';

export default function AwsGettingStartedPage() {
  return (
    <DocPage
      title="Getting Started with AWS Services"
      subtitle="Provision AWS lab environments and manage access for your users."
    >
      <DocSection title="What is AWS Services?">
        <p>
          Racko AWS Services automates the provisioning of AWS lab environments for training,
          demos, and hands-on learning. You create a provisioning request, Racko sets up AWS
          accounts with the services and permissions you specify, and lab users receive secure
          access instructions.
        </p>
        <p>
          Each request can include multiple lab users, selected AWS services (such as EC2 or S3),
          IAM permissions, optional daily usage windows, budget limits, and automatic resource
          cleanup.
        </p>
        <DocNote>
          AWS Services handles access provisioning and lifecycle management. You are billed for
          actual AWS usage through your configured AWS accounts.
        </DocNote>
      </DocSection>

      <DocSection title="What you need before you start">
        <ul className="ml-4 list-disc space-y-2 text-gray-600">
          <li>An admin account with access to the Racko console</li>
          <li>The customer or lab owner&apos;s email address</li>
          <li>The number of lab users (accounts) required — up to 50 per request</li>
          <li>Start and end dates for the lab environment</li>
        </ul>
      </DocSection>

      <DocSection title="Creating your first request">
        <DocSteps
          steps={[
            {
              title: 'Go to AWS Services',
              description:
                'From the Racko console, click "AWS Services" to open the dashboard.',
            },
            {
              title: 'Click Create Request',
              description:
                'Use the Create Request button in the dashboard header to open the request builder.',
            },
            {
              title: 'Complete the 8-step form',
              description:
                'Fill in customer details, usage windows, cleanup settings, budget, services, instances, permissions, and region.',
            },
            {
              title: 'Review pricing and submit',
              description:
                'The pricing summary panel shows your estimated cost. Submit the request to start provisioning.',
            },
            {
              title: 'Track provisioning status',
              description:
                'You are redirected to the request status page where you can watch live provisioning progress.',
            },
          ]}
        />
      </DocSection>

      <DocSection title="How long does provisioning take?">
        <p>
          Most requests complete within a few minutes. Larger requests with many users or complex
          service selections may take longer. The status page updates automatically every few
          seconds until provisioning finishes.
        </p>
      </DocSection>

      <DocSection title="After provisioning completes">
        <p>
          Once the request reaches <strong>Completed</strong> status, lab users can access their
          AWS environment through the manage portal link sent by email. You can view lab user
          roles, per-user spend, and budget status from the request status page.
        </p>
      </DocSection>
    </DocPage>
  );
}
