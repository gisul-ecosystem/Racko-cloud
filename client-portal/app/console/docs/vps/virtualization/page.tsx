import { DocPage, DocSection, DocNote, DocWarning } from '../../../../../components/console/DocPage';

export default function VpsVirtualizationPage() {
  return (
    <DocPage
      title="Virtualization (Hyper-V)"
      subtitle="Enable nested virtualization on Windows VMs to run virtual machines inside your VM."
    >
      <DocSection title="What is nested virtualization?">
        <p>
          Nested virtualization lets you run a hypervisor (like Hyper-V) inside your Racko VM. This
          is useful for development environments, testing, running Docker with Hyper-V isolation, or
          training scenarios where you need VMs within VMs.
        </p>
        <DocNote>
          Nested virtualization is only available on Windows VMs. Linux VMs do not support this feature.
        </DocNote>
      </DocSection>

      <DocSection title="Enabling virtualization">
        <p>
          From the VM detail page, click <strong>Enable Virtualization</strong>. Racko will:
        </p>
        <ul className="ml-4 mt-2 list-disc space-y-2 text-gray-600">
          <li>Enable the nested virtualization CPU flag on the Proxmox hypervisor</li>
          <li>Run a sysprep/configuration script inside the VM to enable the Hyper-V role</li>
          <li>Restart the VM automatically once configuration is complete</li>
        </ul>
        <p className="mt-3">
          The process typically takes 5–15 minutes. Status transitions from <strong>Pending</strong> →
          <strong> Enabling</strong> → <strong>Enabled</strong>.
        </p>
      </DocSection>

      <DocSection title="Virtualization status">
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {[
                { s: 'Disabled', d: 'Virtualization is off. Default state for all VMs.' },
                { s: 'Pending', d: 'Enable request received, waiting to start.' },
                { s: 'Enabling', d: 'Configuration script is running inside the VM.' },
                { s: 'Enabled', d: 'Hyper-V is active and ready to use.' },
                { s: 'Failed', d: 'Enabling failed. Check the error message on the VM detail page.' },
                { s: 'Disabling', d: 'Virtualization is being turned off.' },
              ].map((row) => (
                <tr key={row.s} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-3 font-medium text-gray-900">{row.s}</td>
                  <td className="px-4 py-3 text-gray-500">{row.d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DocSection>

      <DocSection title="Disabling virtualization">
        <p>
          You can disable virtualization from the VM detail page at any time. This removes the
          Hyper-V role and CPU flag. Any running nested VMs will be stopped.
        </p>
        <DocWarning>
          Disabling virtualization will stop all Hyper-V virtual machines running inside your VM.
          Save your work in nested VMs before disabling.
        </DocWarning>
      </DocSection>
    </DocPage>
  );
}
