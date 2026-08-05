'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Cloud,
  ClipboardList,
  Calculator,
  FileSpreadsheet,
  IndianRupee,
  Monitor,
  MonitorCheck,
  Palette,
  Server,
  Shield,
  Users,
} from 'lucide-react';
import { ServiceTileCard } from '@/components/super-admin-console/ServiceTileCard';
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
    id: 'vm-host-leases',
    name: 'VM Host Leases',
    href: '/super-admin-console/vm-host-leases',
    icon: FileSpreadsheet,
    description: 'Upload Excel inventory of leased VM hosts and track expiry dates',
    anyOf: ['vm_host_leases.manage'],
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
    anyOf: ['rbac.assign', 'rbac.roles.write'],
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
              const badgeCount =
                service.badgeKey === 'webyne'
                  ? webynePendingCount
                  : service.badgeKey === 'dedicated'
                    ? dedicatedPendingCount
                    : 0;

              return (
                <ServiceTileCard
                  key={service.id}
                  href={service.href}
                  name={service.name}
                  description={service.description}
                  icon={service.icon}
                  badgeCount={badgeCount}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
