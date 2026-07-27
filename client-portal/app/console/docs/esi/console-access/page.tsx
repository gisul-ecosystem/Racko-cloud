import { DocPage, DocSection, DocNote, DocWarning, DocSteps } from '../../../../../components/console/DocPage';

export default function EsiConsoleAccessPage() {
  return (
    <DocPage
      title="Browser Console Access"
      subtitle="Open a secure browser-based console session to any of your imported servers."
    >
      <DocSection title="How it works">
        <p>
          When you click Open Console, Racko creates a real-time RDP or SSH session through the
          secure browser console. Your server credentials are stored encrypted and are never exposed
          to the browser directly.
        </p>
      </DocSection>

      <DocSection title="Opening a console session">
        <DocSteps
          steps={[
            {
              title: 'Go to My Servers',
              description: 'From the Elastic Server Import sidebar, click My Servers.',
            },
            {
              title: 'Find your server',
              description: 'Locate the server you want to connect to in the list.',
            },
            {
              title: 'Click Console',
              description:
                'Click the Console button. A new browser tab opens with the live session.',
            },
            {
              title: 'Interact with your server',
              description:
                'For RDP you get a full graphical desktop. For SSH you get a terminal. Use your keyboard and mouse as normal.',
            },
          ]}
        />
        <DocNote>
          Console sessions open in a new tab. Keep the tab open to maintain the session. Closing
          the tab ends the session - it does not affect anything running on the server itself.
        </DocNote>
      </DocSection>

      <DocSection title="RDP sessions">
        <p>
          RDP sessions give you full graphical desktop access to Windows servers. You can use
          clipboard paste (Ctrl+V) for text. File transfer is not supported through the browser
          console - use a native RDP client for file transfers.
        </p>
        <DocWarning>
          The browser RDP session shares the same desktop session as a native RDP connection. If
          someone else is already connected via RDP, connecting through Racko may disconnect them
          depending on the server&apos;s RDP session settings.
        </DocWarning>
      </DocSection>

      <DocSection title="SSH sessions">
        <p>
          SSH sessions give you a full terminal. Copy and paste work through the browser. The
          session is kept alive as long as the tab is open. Idle timeout depends on the server&apos;s
          SSH configuration.
        </p>
      </DocSection>

      <DocSection title="Troubleshooting connection failures">
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Error</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Likely cause</th>
              </tr>
            </thead>
            <tbody>
              {[
                { e: 'Connection timed out', c: 'The server IP is unreachable from Racko. Check firewall rules.' },
                { e: 'Authentication failed', c: 'The stored username or password is incorrect. Delete and re-add the server with correct credentials.' },
                { e: 'Connection refused', c: 'RDP or SSH service is not running on the server, or the port is blocked.' },
                { e: 'Session disconnected', c: 'The server was rebooted, or the network connection dropped. Try again.' },
              ].map((row) => (
                <tr key={row.e} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-3 font-medium text-gray-900">{row.e}</td>
                  <td className="px-4 py-3 text-gray-500">{row.c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DocSection>
    </DocPage>
  );
}
