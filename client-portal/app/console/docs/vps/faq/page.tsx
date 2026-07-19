import { DocPage, DocSection, DocFaq } from '../../../../../components/console/DocPage';

export default function VpsFaqPage() {
  return (
    <DocPage title="VPS Hosting - FAQ">
      <DocSection title="General">
        <DocFaq
          items={[
            {
              q: 'How many VMs can I create?',
              a: 'There is no hard limit set by Racko. The practical limit depends on the resources available to your account and service plan.',
            },
            {
              q: 'Can I resize a VM after creation?',
              a: 'CPU and RAM can be adjusted by an administrator when your plan allows it. Disk size can only be increased, not decreased.',
            },
            {
              q: 'What happens to my VM when I delete it?',
              a: 'The VM is permanently removed from Racko along with all its disks. This cannot be undone. Export or backup any data before deleting.',
            },
            {
              q: 'Can I clone an existing VM?',
              a: 'Yes. From the Clone VMs section, select a source VM and provide a name. The clone is a full copy of the disk - it inherits all installed software and configuration from the source.',
            },
          ]}
        />
      </DocSection>

      <DocSection title="Console & Access">
        <DocFaq
          items={[
            {
              q: 'Why does the console say "not ready" even after the VM is running?',
              a: 'Console readiness can take 1-3 minutes after first boot while the VM finishes starting network and remote access services. If it persists, restart the VM or contact support.',
            },
            {
              q: 'I forgot my VM password. Can I reset it?',
              a: 'Your console password is visible on the VM detail page. If it was changed inside the OS, contact your admin because Racko does not manage OS-level passwords after creation.',
            },
            {
              q: 'Can multiple users access the same VM console at once?',
              a: 'RDP allows multiple concurrent sessions if the OS supports it. SSH allows multiple concurrent terminal sessions.',
            },
          ]}
        />
      </DocSection>

      <DocSection title="Jobs & Bulk Operations">
        <DocFaq
          items={[
            {
              q: 'My bulk create job shows "Partial" - what does that mean?',
              a: 'Some VMs were created successfully and others failed. The job detail page shows which VMs failed and why. Successfully created VMs are usable immediately.',
            },
            {
              q: 'Can I cancel a running job?',
              a: 'Yes. On the job detail page, click Cancel Job while the job is in Processing status. VMs already being created finish normally. Remaining VMs that have not started are skipped.',
            },
            {
              q: 'How do I see the passwords for bulk-created VMs?',
              a: 'Go to the job detail page after the job completes. The VM Credentials table shows the name, username, and password for each created VM. You can copy all credentials as CSV.',
            },
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
