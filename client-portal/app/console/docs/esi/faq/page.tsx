import { DocPage, DocSection, DocFaq } from '../../../../../components/console/DocPage';

export default function EsiFaqPage() {
  return (
    <DocPage title="Elastic Server Import - FAQ">
      <DocSection title="General">
        <DocFaq
          items={[
            {
              q: 'What kinds of servers can I import?',
              a: 'Any server with a reachable IP address and RDP (port 3389) or SSH (port 22) enabled. This includes cloud VMs from AWS, Azure, GCP, or any other provider, as well as on-premises physical or virtual servers.',
            },
            {
              q: 'Does Racko manage or monitor my imported servers?',
              a: 'No. Racko only stores the connection details and provides browser console access. It does not monitor, provision, or manage the server in any way.',
            },
            {
              q: 'How many servers can I import?',
              a: 'There is no hard limit on the number of servers you can import.',
            },
            {
              q: 'Are my server credentials stored securely?',
              a: 'Yes. Passwords are encrypted at rest and used only when opening a console session.',
            },
          ]}
        />
      </DocSection>

      <DocSection title="Connectivity">
        <DocFaq
          items={[
            {
              q: 'My server is behind a firewall. Can I still use ESI?',
              a: 'Yes, but you need to allow inbound connections from the Racko gateway IP on port 3389 for RDP or 22 for SSH. Contact your admin for the gateway IP address.',
            },
            {
              q: 'Can I use a private IP address?',
              a: 'Only if the private IP is reachable from Racko - for example, if your server is on the same network. Public IPs work without any special configuration.',
            },
            {
              q: 'Does ESI work with servers that use certificate-based SSH authentication?',
              a: 'Currently ESI supports password-based authentication only for both RDP and SSH.',
            },
          ]}
        />
      </DocSection>

      <DocSection title="Bulk Import">
        <DocFaq
          items={[
            {
              q: 'What happens if one entry in my bulk JSON is invalid?',
              a: 'The import stops at the invalid entry and returns an error. Fix the entry and retry - successfully imported entries before the error are already saved.',
            },
            {
              q: 'Is there a limit to how many servers I can bulk import at once?',
              a: 'You can import up to 100 servers in a single bulk import request.',
            },
            {
              q: 'Can I use "ipAddress" instead of "ip" in the JSON?',
              a: 'Yes. Both "ip" and "ipAddress" are accepted in the JSON format.',
            },
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
