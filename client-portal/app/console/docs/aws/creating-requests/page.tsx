import { DocPage, DocSection, DocNote, DocSteps, DocWarning } from '../../../../../components/console/DocPage';

export default function AwsCreatingRequestsPage() {
  return (
    <DocPage
      title="Creating AWS Requests"
      subtitle="Walk through each step of the AWS provisioning request builder."
    >
      <DocSection title="Overview">
        <p>
          The AWS request builder is an 8-step wizard. You must complete each step before moving
          to the next. A live pricing estimate appears once you reach the Services step.
        </p>
      </DocSection>

      <DocSection title="Step 1 — Customer">
        <DocSteps
          steps={[
            {
              title: 'Customer email',
              description:
                'Enter the email address of the lab owner or customer. Access instructions are sent to this address.',
            },
            {
              title: 'Account count',
              description:
                'Set how many lab users to provision — between 1 and 50. Each user gets their own IAM role or access path.',
            },
            {
              title: 'Start and end dates',
              description:
                'Define the lab window. The end date must be on or after the start date.',
            },
            {
              title: 'Access type',
              description:
                'Labs longer than 7 days use AWS Identity Center. Shorter labs use magic link access for faster setup.',
            },
          ]}
        />
      </DocSection>

      <DocSection title="Step 2 — Usage">
        <p>
          Optionally enable daily usage windows to restrict when lab users can access AWS resources.
          Define time ranges per day of the week and select a timezone. Leave disabled for
          24/7 access throughout the lab period.
        </p>
      </DocSection>

      <DocSection title="Step 3 — Cleanup">
        <p>
          Enable automatic resource cleanup to periodically remove unused AWS resources created
          during the lab. Set the cleanup interval in hours. This helps control costs for
          long-running labs.
        </p>
        <DocNote>
          Cleanup removes resources created by lab users but does not delete the AWS account or
          revoke access.
        </DocNote>
      </DocSection>

      <DocSection title="Step 4 — Budget">
        <p>
          Optionally set a per-user budget in USD. When a user exceeds their budget, their access
          is automatically suspended. You can reinstate suspended users from the request status
          page after reviewing spend.
        </p>
      </DocSection>

      <DocSection title="Step 5 — Services">
        <p>
          Select one or more AWS services from the catalog, grouped by category. Each service
          defines the AWS capabilities available to lab users — for example EC2, S3, or Lambda.
        </p>
      </DocSection>

      <DocSection title="Step 6 — Instances">
        <p>
          For services that support instance types, choose the instance size for each selected
          service. Available options and pricing depend on the service catalog configuration.
        </p>
      </DocSection>

      <DocSection title="Step 7 — Permissions">
        <p>
          Review and customize IAM policies for each selected service. Default policies are
          pre-configured for common lab scenarios. You can add or remove individual policy
          statements before submitting.
        </p>
        <DocWarning>
          Grant only the permissions required for the lab. Overly broad IAM policies increase
          security and cost risk.
        </DocWarning>
      </DocSection>

      <DocSection title="Step 8 — Region">
        <p>
          Select the AWS region where resources will be provisioned. Available regions are filtered
          based on your service and instance selections, with live pricing shown for each option.
        </p>
      </DocSection>

      <DocSection title="Submitting the request">
        <p>
          After selecting a region, review the pricing summary panel and click Submit. You are
          redirected to the request status page where provisioning begins automatically.
        </p>
      </DocSection>
    </DocPage>
  );
}
