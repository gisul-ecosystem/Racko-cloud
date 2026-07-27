import { DocPage, DocSection, DocSteps, DocNote } from '../../../../../components/console/DocPage';

export default function VpsGettingStartedPage() {
  return (
    <DocPage
      title="Getting Started with VPS Hosting"
      subtitle="Provision your first Racko cloud virtual machine in minutes."
    >
      <DocSection title="What is VPS Hosting?">
        <p>
          Racko VPS Hosting gives you dedicated virtual machines running on Racko cloud infrastructure.
          Each VM is isolated, configurable, and accessible through a secure browser console - no
          VPN or SSH client required.
        </p>
        <p>
          VMs are provisioned from ready-to-use templates. You choose the template, set your
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
                'Select an OS template, such as Windows Server 2022. Templates are pre-configured and ready to use.',
            },
            {
              title: 'Set a name and resources',
              description:
                'Give your VM a name. Optionally adjust CPU, RAM, and disk size above the template defaults when your plan allows it.',
            },
            {
              title: 'Set a console password',
              description:
                'Choose a fixed password for all VMs or use dynamic mode to generate a unique password per VM.',
            },
            {
              title: 'Click Create',
              description:
                'Racko starts the provisioning job. You will be redirected to the job tracker where you can watch progress in real time.',
            },
          ]}
        />
      </DocSection>

      <DocSection title="How long does it take?">
        <p>
          A single VM typically provisions in 2-5 minutes. Bulk creation runs in parallel batches.
          Completion time depends on the number of VMs, selected template, storage type, and current
          platform load.
        </p>
        <DocNote>
          If you selected software installation, provisioning takes longer because software is
          installed after the VM is created.
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
