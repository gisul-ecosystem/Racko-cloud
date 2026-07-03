import { DocPage, DocSection, DocFaq } from '../../../../../components/console/DocPage';

export default function AwsFaqPage() {
  return (
    <DocPage title="AWS Services - FAQ">
      <DocSection title="General">
        <DocFaq
          items={[
            {
              q: 'How many lab users can I provision in one request?',
              a: 'Each request supports between 1 and 50 lab users (accounts). Create multiple requests if you need more.',
            },
            {
              q: 'What is the difference between magic link and Identity Center access?',
              a: 'Magic link access is used for labs of 7 days or less and provides quick browser-based AWS console access. Identity Center is used for longer labs and provides more structured user management through AWS SSO.',
            },
            {
              q: 'Can I modify a request after it is submitted?',
              a: 'No. Once submitted, the request configuration is locked. Create a new request if you need different services, permissions, or dates.',
            },
            {
              q: 'Where do I find my requests after creating them?',
              a: 'Requests appear on the AWS Services dashboard, in Recent resources on the main console page, and on the request status page after submission.',
            },
          ]}
        />
      </DocSection>

      <DocSection title="Provisioning & Access">
        <DocFaq
          items={[
            {
              q: 'How do lab users sign in to AWS?',
              a: 'After provisioning completes, the customer receives a manage portal link by email. From there, lab users can generate AWS console magic links or use Identity Center credentials depending on the access type.',
            },
            {
              q: 'What happens when a request expires?',
              a: 'When the end date passes, the request status changes to Expired and lab user access is revoked. AWS resources may be cleaned up depending on your cleanup settings.',
            },
            {
              q: 'Provisioning failed — what should I do?',
              a: 'Open the request status page to see the failure reason. Click Retry provisioning to attempt again. If the problem persists, contact your administrator.',
            },
          ]}
        />
      </DocSection>

      <DocSection title="Budget & Spend">
        <DocFaq
          items={[
            {
              q: 'How is per-user spend calculated?',
              a: 'Spend is pulled from AWS Cost Explorer and attributed to each lab user based on their IAM role activity. Data updates every 24 hours by default.',
            },
            {
              q: 'What happens when a user exceeds their budget?',
              a: 'The user is automatically suspended and cannot access AWS until an admin reinstates them from the request status page.',
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
