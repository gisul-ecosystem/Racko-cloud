'use client';

import Link from 'next/link';
import { Cloud, Globe, Server, Wallet, Monitor, SquarePlus, HardDrive, Loader2, Shield, FolderKanban } from 'lucide-react';
import { RecentResourcesTable } from '../../components/console/RecentResourcesTable';
import { AZURE_ROUTES, AZURE_SERVICE } from '../../cloud_automation/constants';
import { AWS_ROUTES, AWS_SERVICE } from '../../cloud_automation_aws/constants';
import { GCP_ROUTES, GCP_SERVICE } from '../../cloud_automation_gcp/constants';
import { useAdminServices } from '@/context/AdminServicesContext';
import { CONSOLE_TILE_SERVICE_KEY } from '@/lib/adminServicesApi';

const services = [
  {
    id: 'vps',
    name: 'VPS Hosting',
    href: '/dashboard/admin',
    icon: Server,
    description: 'Provision and manage Racko cloud virtual machines',
  },
  {
    id: 'create-vm',
    name: 'VM Catalog',
    href: '/console/create-vm',
    icon: SquarePlus,
    description: 'Browse VM plans, create instances, and manage your VMs',
  },
  {
    id: 'dedicated-server',
    name: 'Dedicated Server',
    href: '/console/dedicated-server',
    icon: HardDrive,
    description: 'Request dedicated hardware plans; super-admin attaches your machine',
  },
  {
    id: 'billing',
    name: 'Billing',
    href: '/dashboard/admin/billing',
    icon: Wallet,
    description: 'Manage your wallet balance, top up, and view transaction history',
  },
  {
    id: 'projects',
    name: 'Projects',
    href: '/console/projects',
    icon: FolderKanban,
    description: 'Create client projects to group resources and track costs',
  },
  {
    id: 'elastic',
    name: 'Elastic Server Import',
    href: '/console/elastic-servers',
    icon: Globe,
    description: 'Connect to external servers from any provider via secure browser console',
  },
  {
    id: AZURE_SERVICE.id,
    name: AZURE_SERVICE.name,
    href: AZURE_ROUTES.dashboard,
    icon: Cloud,
    description: AZURE_SERVICE.description,
  },
  {
    id: AWS_SERVICE.id,
    name: AWS_SERVICE.name,
    href: AWS_ROUTES.dashboard,
    icon: Server,
    description: AWS_SERVICE.description,
  },
  {
    id: GCP_SERVICE.id,
    name: GCP_SERVICE.name,
    href: GCP_ROUTES.dashboard,
    icon: Globe,
    description: GCP_SERVICE.description,
  },
  // TODO: Documentation card temporarily hidden
  // {
  //   id: 'docs',
  //   name: 'Documentation',
  //   href: '/console/docs',
  //   icon: BookOpen,
  //   description: 'Guides and reference for VPS, Elastic Server, AWS, and Azure services',
  // },
  {
    id: 'machine-manager',
    name: 'Machine Manager',
    href: '/console/machine-manager',
    icon: Monitor,
    description: 'Install and manage software on any machine',
  },
  {
    id: 'access-control',
    name: 'Access control',
    href: '/console/access-control',
    icon: Shield,
    description: 'Manage organization roles, operators, and permissions',
  },
];

export default function ConsolePage() {
  const { loading, hasActiveService } = useAdminServices();

  const visible = services.filter((service) => {
    if (service.id === 'access-control' || service.id === 'billing' || service.id === 'projects') {
      return true;
    }
    const key = CONSOLE_TILE_SERVICE_KEY[service.id];
    if (key === null || key === undefined) return true;
    return hasActiveService(key);
  });

  return (
    <div className="mx-auto max-w-screen-xl space-y-8">
      <section>
        <h1 className="mb-5 text-2xl font-bold text-gray-900">Racko.ai services</h1>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
          </div>
        ) : (
          <div className="flex flex-wrap justify-center gap-6">
            {visible.map((service) => {
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
        )}
      </section>

      <RecentResourcesTable />
    </div>
  );
}
