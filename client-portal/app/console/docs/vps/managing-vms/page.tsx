import { DocPage, DocSection, DocNote, DocWarning } from '../../../../../components/console/DocPage';

const statusRows = [
  { status: 'Creating', description: 'VM is being provisioned. Wait for the job to complete.' },
  { status: 'Running', description: 'VM is powered on and operating normally.' },
  { status: 'Stopped', description: 'VM is powered off. Start it to use it.' },
  { status: 'Paused', description: 'VM execution is paused at the hypervisor level.' },
  { status: 'Suspended', description: 'VM state has been saved to disk (hibernate).' },
  { status: 'Error', description: 'An unexpected error occurred. Check the events log.' },
  { status: 'Deleting', description: 'VM deletion is in progress.' },
  { status: 'Delete Failed', description: 'Deletion failed. Retry from the VM detail page.' },
];

export default function ManagingVmsPage() {
  return (
    <DocPage
      title="Managing Your VM"
      subtitle="Start, stop, restart, and monitor your virtual machines."
    >
      <DocSection title="VM Status Reference">
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {statusRows.map((row) => (
                <tr key={row.status} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-3 font-medium text-gray-900">{row.status}</td>
                  <td className="px-4 py-3 text-gray-500">{row.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DocSection>

      <DocSection title="Power Operations">
        <p>From the VM detail page or the VM list, you can perform the following actions:</p>
        <ul className="ml-4 mt-2 list-disc space-y-2 text-gray-600">
          <li><strong>Start</strong> — Powers on a stopped VM. The VM boots and becomes reachable.</li>
          <li><strong>Stop</strong> — Gracefully shuts down the OS before powering off.</li>
          <li><strong>Force Stop</strong> — Immediately cuts power (like pulling the plug). Use only if the VM is unresponsive.</li>
          <li><strong>Restart</strong> — Graceful reboot of the OS.</li>
          <li><strong>Reset</strong> — Hard reset at the hypervisor level. Equivalent to a power cycle.</li>
          <li><strong>Hibernate</strong> — Saves VM state to disk and powers off. Resume restores exactly where it left off.</li>
        </ul>
        <DocWarning>
          Force Stop and Reset do not flush disk writes. Only use them if the VM is completely unresponsive.
        </DocWarning>
      </DocSection>

      <DocSection title="Assigning a VM to a user">
        <p>
          VMs can be assigned to managed users so they appear in the user&apos;s dashboard. Go to
          the VM detail page and use the Assign section, or use the Bulk Assign feature from the
          admin dashboard to assign multiple VMs at once.
        </p>
        <DocNote>
          A user can only access VMs explicitly assigned to them. Unassigned VMs are not visible to
          regular users.
        </DocNote>
      </DocSection>

      <DocSection title="Deleting a VM">
        <p>
          Delete a VM from its detail page or using bulk delete from the VM list. Deletion is
          permanent — it removes the VM from Proxmox and purges all associated disks. There is no
          recycle bin.
        </p>
        <DocWarning>
          Deleted VMs cannot be recovered. Make sure you have exported or backed up any data before
          deleting.
        </DocWarning>
      </DocSection>
    </DocPage>
  );
}
