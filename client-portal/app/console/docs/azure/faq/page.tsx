import { DocPage, DocSection, DocFaq } from '../../../../../components/console/DocPage';

export default function AzureFaqPage() {
  return (
    <DocPage title="Azure Services - FAQ">
      <DocSection title="General">
        <DocFaq
          items={[
            {
              q: 'What is the difference between shared and per-user costing mode?',
              a: 'Shared mode provisions one Azure resource group shared by all lab users. Per-user mode creates a separate resource group for each user, providing stronger isolation at higher cost.',
            },
            {
              q: 'Can I modify a request after it is submitted?',
              a: 'No. Once submitted, the request configuration is locked. Create a new request if you need different services, roles, or dates.',
            },
            {
              q: 'Where do I find my requests after creating them?',
              a: 'Requests appear on the Azure Services dashboard, in Recent resources on the main console page, and on the live provisioning page after submission.',
            },
            {
              q: 'Some services show a shield icon — what does that mean?',
              a: 'Those services require admin access approval before they can be included in a request. Submit an admin access request with your justification and wait for approval.',
            },
          ]}
        />
      </DocSection>

      <DocSection title="Provisioning & Access">
        <DocFaq
          items={[
            {
              q: 'How do lab users sign in to Azure?',
              a: 'After the Sending Access Link step completes, the customer receives a manage portal link by email. Lab users use this portal to access their Azure environment.',
            },
            {
              q: 'What happens when a request expires?',
              a: 'When the end date passes, the request status changes to Expired and lab user access is revoked. Azure resources may be cleaned up depending on your cleanup settings.',
            },
            {
              q: 'A provisioning step failed — what should I do?',
              a: 'Open the live provisioning page and check the orchestration events log for the error details. Contact your administrator if you cannot resolve the issue.',
            },
          ]}
        />
      </DocSection>

      <DocSection title="Usage & Cleanup">
        <DocFaq
          items={[
            {
              q: 'How do daily usage windows work?',
              a: 'Usage windows restrict lab access to specific hours on selected days of the week. Outside those hours, lab users cannot access Azure resources even if their request is active.',
            },
            {
              q: 'What does resource cleanup do?',
              a: 'When enabled, Racko periodically removes unused Azure resources created during the lab at the interval you specify. This helps control costs for long-running labs.',
            },
            {
              q: 'Can I set a budget after the request is created?',
              a: 'Budget limits are configured at request creation time. You cannot change them on an existing request.',
            },
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
