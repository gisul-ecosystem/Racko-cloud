import { DocPage, DocSection, DocNote, DocSteps } from '../../../../../components/console/DocPage';

export default function VpsAutomationPage() {
  return (
    <DocPage
      title="VM Automation"
      subtitle="Schedule automatic start and stop times for your virtual machines."
    >
      <DocSection title="What is VM Automation?">
        <p>
          VM Automation lets you define a daily schedule for when your VMs should start or hibernate.
          This is useful for cost savings - turn off VMs overnight and on weekends, and have them
          ready when you need them.
        </p>
        <DocNote>
          Automation uses hibernate rather than a hard shutdown, so your VM resumes exactly where
          it left off.
        </DocNote>
      </DocSection>

      <DocSection title="Creating a schedule">
        <DocSteps
          steps={[
            {
              title: 'Go to VM Automation',
              description: 'From the admin dashboard, navigate to the VM Automation section.',
            },
            {
              title: 'Click Create Automation',
              description: 'Give the automation a name and select which VMs it applies to.',
            },
            {
              title: 'Set start and stop times',
              description:
                'Choose the daily start time and stop time. Select the timezone that should be used for the schedule.',
            },
            {
              title: 'Set the date range',
              description:
                'Define a start date and end date for when this automation is active.',
            },
            {
              title: 'Save',
              description:
                'The automation becomes active. VMs will automatically hibernate and resume on the defined schedule.',
            },
          ]}
        />
      </DocSection>

      <DocSection title="How it works">
        <p>
          Racko checks your automation rules at regular intervals. When a stop time is reached,
          each VM in the schedule hibernates. When a start time is reached, each VM resumes.
          The <strong>Last Resume</strong> and <strong>Last Hibernate</strong> times are shown on
          the automation detail page so you can verify it ran correctly.
        </p>
      </DocSection>

      <DocSection title="Pausing or editing a schedule">
        <p>
          You can toggle an automation on or off at any time without deleting it, or edit the times
          and VM list. Changes take effect on the next scheduled event.
        </p>
      </DocSection>

      <DocSection title="Manually managed VMs">
        <p>
          If a VM is part of an automation but you manually start or stop it outside the schedule,
          the automation still runs at its next scheduled time. Manual operations take precedence
          immediately, but the schedule resumes from the next event.
        </p>
      </DocSection>
    </DocPage>
  );
}
