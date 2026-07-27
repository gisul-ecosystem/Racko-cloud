import { DocPage, DocSection, DocNote, DocSteps } from '../../../../../components/console/DocPage';

export default function VpsConsoleAccessPage() {
  return (
    <DocPage
      title="Console Access"
      subtitle="Connect to your VM directly from the browser - no VPN, no SSH client needed."
    >
      <DocSection title="How it works">
        <p>
          Racko opens a secure browser-based RDP or SSH session to your VM. Everything happens in
          your browser, so you do not need to install extra client software.
        </p>
      </DocSection>

      <DocSection title="RDP vs SSH">
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Protocol</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Used for</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Port</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">RDP</td>
                <td className="px-4 py-3 text-gray-500">Windows VMs - full graphical desktop</td>
                <td className="px-4 py-3 font-mono text-gray-500">3389</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-medium text-gray-900">SSH</td>
                <td className="px-4 py-3 text-gray-500">Linux VMs - terminal access</td>
                <td className="px-4 py-3 font-mono text-gray-500">22</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3">
          The protocol is automatically determined by the VM&apos;s OS template. Windows templates
          use RDP, Linux templates use SSH. You do not need to configure this manually.
        </p>
      </DocSection>

      <DocSection title="Opening the console">
        <DocSteps
          steps={[
            {
              title: 'Start the VM',
              description: 'The VM must be in Running status before you can open a console session.',
            },
            {
              title: 'Wait for console ready',
              description:
                'After starting, Racko checks when the VM is ready for console access. A "Console Ready" indicator appears once it is reachable - this typically takes 1-3 minutes after first boot.',
            },
            {
              title: 'Click Open Console',
              description:
                'From the VM detail page, click the Open Console button. A new tab opens with the browser console session.',
            },
            {
              title: 'Log in with your credentials',
              description:
                'Use the console username and password shown on the VM detail page. These were set at creation time.',
            },
          ]}
        />
        <DocNote>
          Console sessions are scoped to your account. Each session is authenticated and encrypted in transit.
        </DocNote>
      </DocSection>

      <DocSection title="Credentials">
        <p>
          Your VM&apos;s console username and password are shown on the VM detail page. These credentials
          were set when the VM was created. If you used dynamic password mode during bulk creation,
          each VM has a unique password visible from the job detail page.
        </p>
      </DocSection>
    </DocPage>
  );
}
