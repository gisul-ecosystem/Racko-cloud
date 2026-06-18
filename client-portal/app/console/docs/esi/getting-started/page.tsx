import { DocPage, DocSection, DocNote, DocSteps } from '../../../../../components/console/DocPage';

export default function EsiGettingStartedPage() {
  return (
    <DocPage
      title="Getting Started with Elastic Server Import"
      subtitle="Connect your own servers to Racko for browser-based console access."
    >
      <DocSection title="What is Elastic Server Import?">
        <p>
          Elastic Server Import (ESI) lets you connect servers you already own — from any provider
          or on-premises — to Racko. Once connected, you can access them via a secure browser
          console, just like Racko-provisioned VMs.
        </p>
        <p>
          ESI supports both RDP (Windows) and SSH (Linux) connections. No client software needed —
          everything works through your browser.
        </p>
        <DocNote>
          ESI is for servers you already own and manage. Racko does not provision, bill for, or manage
          the underlying hardware — it only provides the browser console gateway.
        </DocNote>
      </DocSection>

      <DocSection title="What you need before you start">
        <ul className="ml-4 list-disc space-y-2 text-gray-600">
          <li>The server&apos;s IP address (must be reachable from the Racko gateway)</li>
          <li>A valid username and password for the server</li>
          <li>RDP enabled (port 3389) for Windows, or SSH enabled (port 22) for Linux</li>
        </ul>
      </DocSection>

      <DocSection title="Adding your first server">
        <DocSteps
          steps={[
            {
              title: 'Go to Elastic Server Import',
              description: 'From the Racko console, click "Elastic Server Import".',
            },
            {
              title: 'Click Add Server',
              description: 'In the sidebar, click Add Server.',
            },
            {
              title: 'Fill in the details',
              description:
                'Enter a display name, the server\'s IP address, choose RDP or SSH, and provide the username and password.',
            },
            {
              title: 'Click Add VM',
              description:
                'The server is saved and appears in My Servers. Click Open Console to connect.',
            },
          ]}
        />
      </DocSection>

      <DocSection title="Network requirements">
        <p>
          The Racko Guacamole gateway must be able to reach your server&apos;s IP on the required port
          (3389 for RDP, 22 for SSH). If your server is behind a firewall or NAT, ensure the
          appropriate port is open to the Racko gateway&apos;s IP address.
        </p>
      </DocSection>
    </DocPage>
  );
}
