import { DocPage, DocSection, DocNote, DocSteps } from '../../../../../components/console/DocPage';

export default function EsiAddingServersPage() {
  return (
    <DocPage
      title="Adding Servers"
      subtitle="Add servers individually or import many at once using JSON bulk import."
    >
      <DocSection title="Adding a single server">
        <DocSteps
          steps={[
            {
              title: 'Navigate to Add Server',
              description: 'Click "Add Server" in the Elastic Server Import sidebar.',
            },
            {
              title: 'Display name',
              description:
                'Enter a friendly name for the server (e.g. "Finance VM 01"). This is only for your reference.',
            },
            {
              title: 'IP address',
              description:
                'Enter the server\'s IPv4 address. This must be reachable from the Racko gateway.',
            },
            {
              title: 'Protocol',
              description: 'Select RDP for Windows servers or SSH for Linux servers.',
            },
            {
              title: 'Username and password',
              description:
                'Enter the credentials Racko will use to open the console session. For RDP, this is typically "Administrator". For SSH, typically "root".',
            },
            {
              title: 'Click Add VM',
              description: 'The server is saved and immediately available in My Servers.',
            },
          ]}
        />
      </DocSection>

      <DocSection title="Bulk import via JSON">
        <p>
          To add multiple servers at once, use the Bulk Import page. Prepare a JSON array with one
          entry per server:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-gray-900 p-4 text-xs text-green-400">
{`[
  {
    "name": "Finance VM 01",
    "ip": "10.0.0.10",
    "protocol": "rdp",
    "username": "Administrator",
    "password": "YourPassword123!"
  },
  {
    "name": "Linux Build Server",
    "ip": "10.0.0.11",
    "protocol": "ssh",
    "username": "root",
    "password": "YourPassword456!"
  }
]`}
        </pre>
        <p className="mt-3">
          You can paste the JSON directly or upload a <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">.json</code> file.
          Each entry requires at minimum: <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">name</code>,{' '}
          <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">ip</code>, and{' '}
          <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">password</code>.
          Protocol defaults to RDP if omitted. Username defaults to Administrator (RDP) or root (SSH).
        </p>
        <DocNote>
          Bulk import processes all entries immediately. Invalid entries are rejected with an error
          message — fix the JSON and retry.
        </DocNote>
      </DocSection>

      <DocSection title="Editing servers">
        <p>
          There is currently no edit flow for saved servers. To update a server&apos;s credentials or IP,
          delete it and re-add it with the corrected details.
        </p>
      </DocSection>

      <DocSection title="Deleting servers">
        <p>
          From My Servers, click the Delete button next to a server. This removes the server from
          Racko but does not affect the actual server in any way — it only removes the connection
          record.
        </p>
      </DocSection>
    </DocPage>
  );
}
