import Link from 'next/link';
import { BookOpen, Server, Globe, ArrowRight } from 'lucide-react';

const sections = [
  {
    icon: Server,
    title: 'VPS Hosting',
    description: 'Learn how to provision, manage, and access your Racko cloud virtual machines.',
    color: 'bg-blue-50 text-blue-600',
    links: [
      { href: '/console/docs/vps/getting-started', label: 'Getting Started' },
      { href: '/console/docs/vps/managing-vms', label: 'Managing Your VM' },
      { href: '/console/docs/vps/console-access', label: 'Console Access' },
      { href: '/console/docs/vps/virtualization', label: 'Virtualization' },
      { href: '/console/docs/vps/automation', label: 'VM Automation' },
      { href: '/console/docs/vps/faq', label: 'FAQ' },
    ],
  },
  {
    icon: Globe,
    title: 'Elastic Server Import',
    description: 'Connect and manage your own external servers through a secure browser console.',
    color: 'bg-green-50 text-green-600',
    links: [
      { href: '/console/docs/esi/getting-started', label: 'Getting Started' },
      { href: '/console/docs/esi/adding-servers', label: 'Adding Servers' },
      { href: '/console/docs/esi/console-access', label: 'Browser Console' },
      { href: '/console/docs/esi/faq', label: 'FAQ' },
    ],
  },
];

export default function DocsPage() {
  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-[#B91C1C]">
          <BookOpen className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Documentation</h1>
        <p className="mt-1.5 text-sm text-gray-500">
          Everything you need to know about using Racko services.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <div
              key={section.title}
              className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <div className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg ${section.color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="text-base font-semibold text-gray-900">{section.title}</h2>
              <p className="mt-1 text-sm text-gray-500">{section.description}</p>
              <ul className="mt-4 space-y-2">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="flex items-center gap-2 text-sm text-[#B91C1C] hover:underline"
                    >
                      <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
