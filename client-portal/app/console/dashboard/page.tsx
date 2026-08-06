'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  BookOpen,
  Boxes,
  Cloud,
  FlaskConical,
  FolderKanban,
  HardDrive,
  Loader2,
  Monitor,
  PlusCircle,
  Server,
  Shield,
  Wallet,
} from 'lucide-react';
import { TenantRecentResources } from '@/components/tenant/TenantRecentResources';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { useTenantServices } from '@/context/TenantServicesContext';
import { useTenantRbac } from '@/context/TenantRbacContext';
import { hexToRgba } from '@/lib/tenantAccentStyles';
import { isServiceHiddenFromUi } from '@/lib/hiddenServices';
import { canAccessTenantHubTile } from '@/lib/tenantServicePermissions';
import { tenantConsole, tenantVps } from '@/lib/tenantAdminRoutes';
import type { TenantServiceKey } from '@/types/tenantPortal';

const SERVICE_TILES: Array<{
  serviceKey: TenantServiceKey | 'billing' | 'projects' | 'access-control';
  name: string;
  href: string;
  description: string;
  icon: typeof Server;
}> = [
  {
    serviceKey: 'projects',
    name: 'Projects',
    href: tenantConsole.projects,
    icon: FolderKanban,
    description: 'Create client projects to group resources and track costs',
  },
  {
    serviceKey: 'vm-management',
    name: 'VPS Hosting',
    href: tenantVps.overview,
    icon: Server,
    description: 'Provision and manage Racko cloud virtual machines',
  },
  {
    serviceKey: 'create-vm',
    name: 'VM Catalog',
    href: tenantConsole.createVm,
    icon: PlusCircle,
    description: 'Browse Webyne VM plans and request catalog virtual machines',
  },
  {
    serviceKey: 'dedicated-server',
    name: 'Dedicated Server',
    href: tenantConsole.dedicatedServer,
    icon: HardDrive,
    description: 'Request and manage dedicated bare-metal servers',
  },
  {
    serviceKey: 'billing',
    name: 'Billing',
    href: tenantVps.billing,
    icon: Wallet,
    description: 'Manage your wallet balance, top up, and view transaction history',
  },
  {
    serviceKey: 'elastic-servers',
    name: 'Elastic Server Import',
    href: tenantConsole.elastic,
    icon: Boxes,
    description: 'Connect to external servers from any provider via secure browser console',
  },
  {
    serviceKey: 'cloud-labs',
    name: 'Cloud Labs',
    href: tenantConsole.cloudLabs,
    icon: FlaskConical,
    description: 'Hands-on lab environments — Azure Labs first, more clouds next.',
  },
  {
    serviceKey: 'azure',
    name: 'Azure Services',
    href: tenantConsole.azure,
    icon: Cloud,
    description: 'Azure access management, provisioning, and lab environments.',
  },
  {
    serviceKey: 'aws',
    name: 'AWS Services',
    href: tenantConsole.aws,
    icon: Server,
    description: 'AWS access management, provisioning, and lab environments.',
  },
  {
    serviceKey: 'docs',
    name: 'Documentation',
    href: tenantConsole.docs,
    icon: BookOpen,
    description: 'Guides and reference for VPS, Elastic Server, AWS, and Azure services',
  },
  {
    serviceKey: 'machine-manager',
    name: 'Machine Manager',
    href: tenantConsole.machineManager,
    icon: Monitor,
    description: 'Install and manage software on any machine',
  },
  {
    serviceKey: 'access-control',
    name: 'Access control',
    href: tenantConsole.accessControl,
    icon: Shield,
    description: 'Manage roles, operators, and permissions for this workspace',
  },
];

export default function TenantConsolePage() {
  const router = useRouter();
  const { tenantUser } = useTenantAuth();
  const { accentColor, portalName } = useTenantBranding();
  const { loading, hasActiveService } = useTenantServices();
  const { loading: rbacLoading, isConsoleStaff, hasPermission, isTenantAdmin } = useTenantRbac();

  useEffect(() => {
    if (rbacLoading) return;
    // Elastic end-users only — console operators stay on the hub.
    if (tenantUser?.role === 'tenant_user' && !isConsoleStaff) {
      router.replace(tenantVps.vms);
    }
  }, [router, tenantUser?.role, isConsoleStaff, rbacLoading]);

  const tiles = SERVICE_TILES.filter((tile) => {
    if (isServiceHiddenFromUi(tile.serviceKey)) return false;
    if (
      tile.serviceKey !== 'billing' &&
      tile.serviceKey !== 'projects' &&
      tile.serviceKey !== 'access-control' &&
      !hasActiveService(tile.serviceKey)
    ) {
      return false;
    }
    if (tile.serviceKey === 'access-control') {
      return isTenantAdmin || hasPermission('rbac.roles.write', 'rbac.assign');
    }
    return canAccessTenantHubTile(tile.serviceKey, hasPermission, isTenantAdmin);
  });

  if (loading || rbacLoading || (tenantUser?.role === 'tenant_user' && !isConsoleStaff)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin" style={{ color: accentColor }} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-screen-xl space-y-8">
      <section>
        <h1 className="mb-5 text-2xl font-bold text-gray-900">{portalName} services</h1>
        <div className="flex flex-wrap justify-center gap-6">
          {tiles.map((service) => {
            const Icon = service.icon;
            return (
              <Link
                key={service.serviceKey}
                href={service.href}
                className="group flex h-[200px] w-[200px] flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-5 text-center shadow-sm transition hover:shadow-md"
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = accentColor;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '';
                }}
              >
                <div
                  className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl transition"
                  style={{
                    backgroundColor: hexToRgba(accentColor, 0.1),
                    color: accentColor,
                  }}
                >
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
      <TenantRecentResources />
    </div>
  );
}
