'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Cloud,
  ClipboardList,
  IndianRupee,
  Monitor,
  MonitorCheck,
  Palette,
  Server,
  Users,
} from 'lucide-react';
import { fetchCatalogVmRequesters } from '@/lib/vmCatalogApi';

const services = [
  {
    id: 'vm-management',
    name: 'VM Management',
    href: '/super-admin-console/vm-management',
    icon: MonitorCheck,
    description: 'Monitor cluster, manage VMs, alerts, software and templates',
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
    showPendingBadge: true,
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const requesters = await fetchCatalogVmRequesters();
        if (cancelled) return;
        const total = requesters.reduce((sum, r) => sum + r.pendingCount, 0);
        setWebynePendingCount(total);
      } catch {
        if (!cancelled) setWebynePendingCount(0);
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
              'showPendingBadge' in service && service.showPendingBadge
                ? webynePendingCount
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
                    aria-label={`${badgeCount} pending Webyne VM request${badgeCount === 1 ? '' : 's'}`}
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
