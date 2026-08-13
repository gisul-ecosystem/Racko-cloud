'use client';

import Link from 'next/link';
import { BookOpen, Server, Globe, Cloud, ArrowRight } from 'lucide-react';
import { useAdminServices } from '@/context/AdminServicesContext';
import { filterDocsTopics, type DocsTopicKey } from '@/lib/docsServiceSections';

const sections: Array<{
  topic: DocsTopicKey;
  icon: typeof Server;
  title: string;
  description: string;
  color: string;
  links: { href: string; label: string }[];
}> = [
  {
    topic: 'vps',
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
    topic: 'esi',
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
  {
    topic: 'azure',
    icon: Cloud,
    title: 'Azure Services',
    description: 'Provision Azure lab environments, manage access, and track live provisioning.',
    color: 'bg-sky-50 text-sky-600',
    links: [
      { href: '/console/docs/azure/getting-started', label: 'Getting Started' },
      { href: '/console/docs/azure/creating-requests', label: 'Creating Requests' },
      { href: '/console/docs/azure/request-status', label: 'Request Status' },
      { href: '/console/docs/azure/faq', label: 'FAQ' },
    ],
  },
  {
    topic: 'aws',
    icon: Server,
    title: 'AWS Services',
    description: 'Provision AWS lab environments, configure IAM access, and monitor spend.',
    color: 'bg-orange-50 text-orange-600',
    links: [
      { href: '/console/docs/aws/getting-started', label: 'Getting Started' },
      { href: '/console/docs/aws/creating-requests', label: 'Creating Requests' },
      { href: '/console/docs/aws/request-status', label: 'Request Status' },
      { href: '/console/docs/aws/faq', label: 'FAQ' },
    ],
  },
];

export default function DocsPage() {
  const { hasActiveService, loading } = useAdminServices();
  const visible = loading ? [] : filterDocsTopics(sections, hasActiveService);

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-[#B91C1C]">
          <BookOpen className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Documentation</h1>
        <p className="mt-1.5 text-sm text-gray-500">
          Guides for the product services enabled on your account.
        </p>
      </div>

      {visible.length === 0 && !loading ? (
        <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-5 py-8 text-center text-sm text-gray-500">
          No documentation topics yet. Enable a product service to see related guides.
        </p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {visible.map((section) => {
            const Icon = section.icon;
            return (
              <div
                key={section.title}
                className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <div
                  className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg ${section.color}`}
                >
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
      )}
    </div>
  );
}
