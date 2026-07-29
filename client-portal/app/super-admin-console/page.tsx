'use client';

import { useEffect, useMemo, useState } from 'react';
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
  Shield,
  Users,
} from 'lucide-react';
import { fetchCatalogVmRequesters } from '@/lib/vmCatalogApi';
import { fetchDedicatedRequesters } from '@/lib/dedicatedServerApi';
import { useAuth } from '@/context/AuthContext';
import { useRbacPermissions } from '@/context/RbacPermissionsContext';
import { hasPermission } from '@/lib/rbacApi';

type ServiceTile = {
  id: string;
  name: string;
  href: string;
  icon: typeof MonitorCheck;
  description: string;
  badgeKey?: 'webyne' | 'dedicated';
  /** Any of these permissions unlocks the tile for staff. Super admin always sees all. */
  anyOf?: string[];
  /** Only super_admin (Access Control management in v1). */
  superAdminOnly?: boolean;
};

const services: ServiceTile[] = [
  {
    id: 'vm-management',
    name: 'VM Management',
    href: '/super-admin-console/vm-management',
    icon: MonitorCheck,
    description: 'Monitor cluster, manage VMs, alerts, software and templates',
    anyOf: ['vm_management.manage'],
  },
  {
    id: 'vm-pricing-calculator',
    name: 'VM Pricing Calculator',
    href: '/super-admin-console/vm-pricing-calculator',
    icon: Calculator,
    description: 'Compare live AWS, Azure, OCI and GCP list prices for a VM size',
    anyOf: ['pricing.calculator.read', 'pricing.webyne.read'],
  },
  {
    id: 'external-vm-pricing',
    name: 'External VM Pricing and Configuration',
    href: '/super-admin-console/external-vm-pricing',
    icon: IndianRupee,
    description: 'Override catalog plan prices from the external provider',
    anyOf: ['pricing.webyne.read', 'pricing.webyne.write'],
  },
  {
    id: 'webyne-vm-requests',
    name: 'Webyne VM Request',
    href: '/super-admin-console/webyne-vm-requests',
    icon: ClipboardList,
    description: 'Review catalog VM buy requests from admins, grouped by requester',
    badgeKey: 'webyne',
    anyOf: ['webyne.requests.read'],
  },
  {
    id: 'dedicated-server-requests',
    name: 'Dedicated Server Request',
    href: '/super-admin-console/dedicated-server-requests',
    icon: ClipboardList,
    description: 'Review dedicated server requests and attach machines manually',
    badgeKey: 'dedicated',
    anyOf: ['dedicated.requests.read'],
  },
  {
    id: 'azure',
    name: 'Azure Service Management',
    href: '/super-admin-console/azure/org-admin',
    icon: Cloud,
    description: 'Manage Azure cloud services and resources',
    anyOf: ['azure.manage'],
  },
  {
    id: 'aws',
    name: 'AWS Lab Management',
    href: '/super-admin-console/aws/org-admin',
    icon: Server,
    description: 'Oversee AWS lab requests, manage users, budgets and cleanup',
    anyOf: ['aws.manage'],
  },
  {
    id: 'machine-manager',
    name: 'Machine Manager',
    href: '/super-admin-console/machine-manager',
    icon: Monitor,
    description: 'Manage software catalog for machine installations',
    anyOf: ['machine_manager.manage'],
  },
  {
    id: 'white-labelling',
    name: 'White Labelling Service',
    href: '/super-admin-console/white-labelling',
    icon: Palette,
    description: 'Manage tenants, branding, service configs and tenant admins',
    anyOf: ['white_labelling.manage'],
  },
  {
    id: 'customers',
    name: 'Customer Directory',
    href: '/super-admin-console/customers',
    icon: Users,
    description:
      'Individual and organization customers, tenants, wallets, services, and org access requests',
    anyOf: ['admin_users.manage'],
  },
  {
    id: 'access-control',
    name: 'Access control',
    href: '/super-admin-console/access-control',
    icon: Shield,
    description: 'Roles and staff permissions for the Super Admin dashboard',
    superAdminOnly: true,
  },
];

export default function SuperAdminConsolePage() {
  const { user } = useAuth();
  const rbac = useRbacPermissions();
  const [webynePendingCount, setWebynePendingCount] = useState(0);
  const [dedicatedPendingCount, setDedicatedPendingCount] = useState(0);

  const visibleServices = useMemo(() => {
    const isSa = user?.role === 'super_admin' || rbac?.isSuperAdmin;
    if (isSa) return services;
    return services.filter((s) => {
      if (s.superAdminOnly) return false;
      if (!s.anyOf || s.anyOf.length === 0) return false;
      return s.anyOf.some((key) => hasPermission(rbac, key));
    });
  }, [user?.role, rbac]);

  const canReadWebyne = hasPermission(rbac, 'webyne.requests.read');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const webynePromise = canReadWebyne
          ? fetchCatalogVmRequesters().catch(() => [])
          : Promise.resolve([]);
        const dedicatedPromise =
          hasPermission(rbac, 'dedicated.requests.read')
            ? fetchDedicatedRequesters().catch(() => [])
            : Promise.resolve([]);
        const [webyne, dedicated] = await Promise.all([webynePromise, dedicatedPromise]);
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
  }, [canReadWebyne, rbac]);

  return (
    <div className="mx-auto max-w-screen-xl space-y-8">
      <section>
        <h1 className="mb-5 text-2xl font-bold text-gray-900">Racko.ai services</h1>

        {visibleServices.length === 0 ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            No services are assigned to your staff account yet. Ask a Super Admin to grant roles under
            Access control.
          </p>
        ) : (
          <div className="flex flex-wrap justify-center gap-6">
            {visibleServices.map((service) => {
              const Icon = service.icon;
              const badgeCount =
                service.badgeKey === 'webyne'
                  ? webynePendingCount
                  : service.badgeKey === 'dedicated'
                    ? dedicatedPendingCount
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
        )}
      </section>
    </div>
  );
}
