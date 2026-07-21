'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Cloud,
  ClipboardList,
  Calculator,
  IndianRupee,
  Monitor,
  MonitorCheck,
  Palette,
  Server,
  Users,
} from 'lucide-react';
import { fetchCatalogVmRequesters } from '@/lib/vmCatalogApi';
import { fetchDedicatedRequesters } from '@/lib/dedicatedServerApi';

const services = [
  {
    id: 'vm-management',
    name: 'VM Management',
    href: '/super-admin-console/vm-management',
    icon: MonitorCheck,
    description: 'Monitor cluster, manage VMs, alerts, software and templates',
  },
  {
    id: 'vm-pricing-calculator',
    name: 'VM Pricing Calculator',
    href: '/super-admin-console/vm-pricing-calculator',
    icon: Calculator,
    description: 'Compare live AWS, Azure, OCI and GCP list prices for a VM size',
  },
  {
    id: 'external-vm-pricing',
    name: 'External VM Pricing and Configuration',
    href: '/super-admin-console/external-vm-pricing',
    icon: IndianRupee,
    description: 'Override catalog plan prices from the external provider',
  },
  {
    id: 'webyne-vm-requests',
    name: 'Webyne VM Request',
    href: '/super-admin-console/webyne-vm-requests',
    icon: ClipboardList,
    description: 'Review catalog VM buy requests from admins, grouped by requester',
    badgeKey: 'webyne' as const,
  },
  {
    id: 'dedicated-server-requests',
    name: 'Dedicated Server Request',
    href: '/super-admin-console/dedicated-server-requests',
    icon: ClipboardList,
    description: 'Review dedicated server requests and attach machines manually',
    badgeKey: 'dedicated' as const,
  },
  {
    id: 'azure',
    name: 'Azure Service Management',
    href: '/super-admin-console/azure/org-admin',
    icon: Cloud,
    description: 'Manage Azure cloud services and resources',
  },
  {
    id: 'aws',
    name: 'AWS Lab Management',
    href: '/super-admin-console/aws/org-admin',
    icon: Server,
    description: 'Oversee AWS lab requests, manage users, budgets and cleanup',
  },
  {
    id: 'machine-manager',
    name: 'Machine Manager',
    href: '/super-admin-console/machine-manager',
    icon: Monitor,
    description: 'Manage software catalog for machine installations',
  },
  {
    id: 'white-labelling',
    name: 'White Labelling Service',
    href: '/super-admin-console/white-labelling',
    icon: Palette,
    description: 'Manage tenants, branding, service configs and tenant admins',
  },
  {
    id: 'admin-users',
    name: 'Admin Users',
    href: '/super-admin-console/admin-users',
    icon: Users,
    description: 'View active admins, wallet balances and manage billing',
  },
] as const;

export default function SuperAdminConsolePage() {
  const [webynePendingCount, setWebynePendingCount] = useState(0);
  const [dedicatedPendingCount, setDedicatedPendingCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [webyne, dedicated] = await Promise.all([
          fetchCatalogVmRequesters().catch(() => []),
          fetchDedicatedRequesters().catch(() => []),
        ]);
        if (cancelled) return;
        setWebynePendingCount(webyne.reduce((sum, r) => sum + r.pendingCount, 0));
        setDedicatedPendingCount(dedicated.reduce((sum, r) => sum + r.pendingCount, 0));
      } catch {
        if (!cancelled) {
          setWebynePendingCount(0);
          setDedicatedPendingCount(0);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-screen-xl space-y-8">
      <section>
        <h1 className="mb-5 text-2xl font-bold text-gray-900">Racko.ai services</h1>

        <div className="flex flex-wrap justify-center gap-6">
          {services.map((service) => {
            const Icon = service.icon;
            const badgeCount =
              'badgeKey' in service
                ? service.badgeKey === 'webyne'
                  ? webynePendingCount
                  : dedicatedPendingCount
                : 0;

            return (
              <Link
                key={service.id}
                href={service.href}
                className="group relative flex h-[200px] w-[200px] flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-5 text-center shadow-sm transition hover:border-[#B91C1C] hover:shadow-md"
              >
                {badgeCount > 0 ? (
                  <span
                    className="absolute right-3 top-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#B91C1C] px-1.5 text-[11px] font-bold text-white"
                    aria-label={`${badgeCount} pending`}
                  >
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                ) : null}
                <div className="relative mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-red-50 text-[#B91C1C] transition group-hover:bg-[#B91C1C] group-hover:text-white">
                  <Icon className="h-7 w-7" />
                </div>
                <span className="text-sm font-medium text-gray-900">{service.name}</span>
                <span className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-gray-500">
                  {service.description}
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
