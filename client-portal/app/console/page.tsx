'use client';

import Link from 'next/link';
import { Cloud, Globe, Monitor, Server, BookOpen } from 'lucide-react';
import { RecentResourcesTable } from '../../components/console/RecentResourcesTable';
import { AZURE_ROUTES, AZURE_SERVICE } from '../../cloud_automation/constants';

const services = [
  {
    id: 'vps',
    name: 'VPS Hosting',
    href: '/dashboard/admin',
    icon: Server,
    description: 'Provision and manage Racko cloud virtual machines',
    available: true,
  },
  {
    id: 'elastic',
    name: 'Elastic Server Import',
    href: '/console/elastic-servers',
    icon: Globe,
    description: 'Connect to external servers from any provider via secure browser console',
    available: true,
  },
  {
    id: AZURE_SERVICE.id,
    name: AZURE_SERVICE.name,
    href: AZURE_ROUTES.dashboard,
    icon: Cloud,
    description: AZURE_SERVICE.description,
    available: true,
  },
  {
    id: 'docs',
    name: 'Documentation',
    href: '/console/docs',
    icon: BookOpen,
    description: 'Guides and reference for VPS Hosting and Elastic Server Import',
    available: true,
  },
  {
    id: 'machine-manager',
    name: 'Machine Manager',
    href: '/console/machine-manager',
    icon: Monitor,
    description: 'Install and manage software on any machine',
    available: true,
  },
] as const;

export default function ConsolePage() {
  return (
    <div className="mx-auto max-w-screen-xl space-y-8">
      <section>
        <h1 className="mb-5 text-2xl font-bold text-gray-900">Racko.ai services</h1>

        <div className="flex flex-wrap justify-center gap-6">
          {services.map((service) => {
            const Icon = service.icon;

            return (
              <Link
                key={service.id}
                href={service.href}
                className="group flex h-[200px] w-[200px] flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-5 text-center shadow-sm transition hover:border-[#B91C1C] hover:shadow-md"
              >
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-red-50 text-[#B91C1C] transition group-hover:bg-[#B91C1C] group-hover:text-white">
                  <Icon className="h-7 w-7" />
                </div>
                <span className="text-sm font-medium text-gray-900">{service.name}</span>
                {service.description && (
                  <span className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-gray-500">
                    {service.description}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      <RecentResourcesTable />
    </div>
  );
}
