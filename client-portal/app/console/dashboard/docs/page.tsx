'use client';

import Link from 'next/link';
import { ArrowRight, BookOpen, Cloud, Globe, Server } from 'lucide-react';
import { tenantConsole } from '@/lib/tenantAdminRoutes';
import { useTenantServices } from '@/context/TenantServicesContext';
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
    description: 'Learn how to provision, manage, and access your cloud virtual machines.',
    color: 'bg-blue-50 text-blue-600',
    links: [
      { href: `${tenantConsole.docs}/vps/getting-started`, label: 'Getting Started' },
      { href: `${tenantConsole.docs}/vps/managing-vms`, label: 'Managing Your VM' },
      { href: `${tenantConsole.docs}/vps/console-access`, label: 'Console Access' },
      { href: `${tenantConsole.docs}/vps/faq`, label: 'FAQ' },
    ],
  },
  {
    topic: 'esi',
    icon: Globe,
    title: 'Elastic Server Import',
    description: 'Connect and manage your own external servers through a secure browser console.',
    color: 'bg-green-50 text-green-600',
    links: [
      { href: `${tenantConsole.docs}/esi/getting-started`, label: 'Getting Started' },
      { href: `${tenantConsole.docs}/esi/adding-servers`, label: 'Adding Servers' },
      { href: `${tenantConsole.docs}/esi/console-access`, label: 'Browser Console' },
      { href: `${tenantConsole.docs}/esi/faq`, label: 'FAQ' },
    ],
  },
  {
    topic: 'azure',
    icon: Cloud,
    title: 'Azure Services',
    description: 'Provision Azure lab environments, manage access, and track provisioning.',
    color: 'bg-sky-50 text-sky-600',
    links: [
      { href: `${tenantConsole.docs}/azure/getting-started`, label: 'Getting Started' },
      { href: `${tenantConsole.docs}/azure/creating-requests`, label: 'Creating Requests' },
      { href: `${tenantConsole.docs}/azure/request-status`, label: 'Request Status' },
      { href: `${tenantConsole.docs}/azure/faq`, label: 'FAQ' },
    ],
  },
  {
    topic: 'aws',
    icon: BookOpen,
    title: 'AWS Services',
    description: 'Provision AWS lab environments, manage access, and track provisioning.',
    color: 'bg-orange-50 text-orange-600',
    links: [
      { href: `${tenantConsole.docs}/aws/getting-started`, label: 'Getting Started' },
      { href: `${tenantConsole.docs}/aws/creating-requests`, label: 'Creating Requests' },
      { href: `${tenantConsole.docs}/aws/request-status`, label: 'Request Status' },
      { href: `${tenantConsole.docs}/aws/faq`, label: 'FAQ' },
    ],
  },
];

export default function TenantDocsHubPage() {
  const { hasActiveService, loading } = useTenantServices();
  const visible = loading ? [] : filterDocsTopics(sections, hasActiveService);

  return (
    <div className="mx-auto max-w-screen-lg space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Documentation</h1>
        <p className="mt-1 text-sm text-gray-500">
          Guides for the product services enabled in this workspace
        </p>
      </div>
      {visible.length === 0 && !loading ? (
        <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-5 py-8 text-center text-sm text-gray-500">
          No documentation topics yet. Enable a product service to see related guides.
        </p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {visible.map((section) => {
            const Icon = section.icon;
            return (
              <div
                key={section.title}
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div
                  className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg ${section.color}`}
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
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900"
                      >
                        {link.label}
                        <ArrowRight className="h-3.5 w-3.5" />
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
