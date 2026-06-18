import { DocPage, DocSection, DocSteps, DocNote } from '../../../../../components/console/DocPage';

export default function VpsGettingStartedPage() {
  return (
    <DocPage
      title="Getting Started with VPS Hosting"
      subtitle="Provision your first Racko cloud virtual machine in minutes."
    >
      <DocSection title="What is VPS Hosting?">
        <p>
          Racko VPS Hosting gives you dedicated virtual machines running on our cloud infrastructure.
          Each VM is isolated, fully configurable, and accessible via a secure browser console — no
          VPN or SSH client required.
        </p>
        <p>
          VMs are provisioned from pre-configured templates. You choose the template, set your
          resource allocation, and Racko handles the rest.
        </p>
      </DocSection>

      <DocSection title="Creating your first VM">
        <DocSteps
          steps={[
            {
              title: 'Go to VPS Hosting',
              description: 'From the Racko console, click "VPS Hosting" to enter the admin dashboard.',
            },
            {
              title: 'Click "Create VM"',
              description: 'Hit the Create VM button in the top right of your VM list.',
            },
            {
              title: 'Choose a template',
              description:
                'Select an OS template (e.g. Windows Server 2022). Templates are pre-configured by your super admin.',
            },
            {
              title: 'Set a name and resources',
              description:
                'Give your VM a name (letters, numbers, hyphens). Optionally adjust CPU, RAM, and disk size above the template defaults.',
            },
            {
              title: 'Set a console password',
              description:
                'Choose a fixed password for all VMs or use dynamic mode to generate a unique password per VM.',
            },
            {
              title: 'Click Create',
              description:
                'Racko starts a background job. You\'ll be redirected to the job tracker where you can watch progress in real time.',
            },
          ]}
        />
      </DocSection>

      <DocSection title="How long does it take?">
        <p>
          A single VM typically provisions in 2–5 minutes. Bulk creation runs in parallel batches —
          10 VMs usually complete in under 10 minutes depending on storage type and cluster load.
        </p>
        <DocNote>
          If you selected software installation (e.g. Chrome, VS Code), provisioning takes longer
          as software is installed after the VM is created.
        </DocNote>
      </DocSection>

      <DocSection title="What happens after creation?">
        <p>
          Once the job completes, your VM appears in the VM list with a <strong>Stopped</strong> status.
          You can start it, open the browser console, assign it to a user, or manage it from the VM
          detail page.
        </p>
      </DocSection>
    </DocPage>
  );
}
