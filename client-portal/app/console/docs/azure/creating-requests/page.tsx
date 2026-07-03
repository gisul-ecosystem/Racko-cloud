import { DocPage, DocSection, DocNote, DocSteps, DocWarning } from '../../../../../components/console/DocPage';

export default function AzureCreatingRequestsPage() {
  return (
    <DocPage
      title="Creating Azure Requests"
      subtitle="Configure customer details, services, permissions, and location for your lab."
    >
      <DocSection title="Overview">
        <p>
          The Azure request builder is a single-page form with progressive sections. Each section
          unlocks after the previous one is complete. A live pricing estimate updates as you
          configure services and instances.
        </p>
      </DocSection>

      <DocSection title="Customer details">
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
                'Set how many lab users to provision. Each user gets their own Azure account in the resource group.',
            },
            {
              title: 'Costing mode',
              description:
                'Choose shared (one resource group for all users) or per-user (separate resource groups per user).',
            },
            {
              title: 'Start and end dates',
              description:
                'Define the lab window. The end date must be on or after the start date.',
            },
          ]}
        />
      </DocSection>

      <DocSection title="Services">
        <p>
          Select one or more Azure services from the catalog, grouped by category. Each service
          defines the Azure capabilities available to lab users — for example Virtual Machines,
          Storage, or SQL Database.
        </p>
        <p>
          Some services require admin access approval before they can be selected. If a service
          shows a shield icon, submit an admin access request explaining why you need it.
        </p>
      </DocSection>

      <DocSection title="Instances">
        <p>
          For services that support instance types, choose the instance size for each selected
          service. The form shows available options and pricing guidance from the catalog.
        </p>
      </DocSection>

      <DocSection title="Permissions">
        <p>
          Assign Azure roles for each selected service. Tier-automated services have roles
          pre-selected based on the service tier. For other services, manually select the
          required Azure RBAC roles from the available list.
        </p>
        <DocWarning>
          Grant only the roles required for the lab. Overly broad role assignments increase
          security and cost risk.
        </DocWarning>
      </DocSection>

      <DocSection title="Location">
        <p>
          Select the Azure region where resources will be provisioned. Available locations are
          filtered based on your service and instance selections.
        </p>
      </DocSection>

      <DocSection title="Usage windows (optional)">
        <p>
          Restrict when lab users can access Azure resources by defining daily time windows per
          day of the week. Select a timezone for the schedule. Leave empty for 24/7 access
          throughout the lab period.
        </p>
      </DocSection>

      <DocSection title="Resource cleanup (optional)">
        <p>
          Enable automatic resource cleanup to periodically remove unused Azure resources created
          during the lab. Set the cleanup interval in hours to control how often cleanup runs.
        </p>
        <DocNote>
          Cleanup removes resources created by lab users but does not delete the resource group
          or revoke access.
        </DocNote>
      </DocSection>

      <DocSection title="Budget (optional)">
        <p>
          Set a per-user budget in USD. When a user exceeds their budget, their access is
          automatically suspended. You can review and manage suspended users from the request
          status page.
        </p>
      </DocSection>

      <DocSection title="Submitting the request">
        <p>
          Once all required sections are complete, review the pricing summary and click Submit.
          You are redirected to the live provisioning page where orchestration begins
          automatically.
        </p>
      </DocSection>
    </DocPage>
  );
}
