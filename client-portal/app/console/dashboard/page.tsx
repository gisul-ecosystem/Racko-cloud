'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  BookOpen,
  Boxes,
  Cloud,
  FlaskConical,
  FolderKanban,
  HardDrive,
  LayoutList,
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

type HubTile = {
  serviceKey: TenantServiceKey | 'billing' | 'projects' | 'access-control' | 'docs';
  name: string;
  href: string;
  description: string;
  icon: typeof Server;
};

/** Product entitlements from tenantserviceconfigs. */
const PRODUCT_TILES: HubTile[] = [
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
    serviceKey: 'elastic-servers',
    name: 'Elastic Server Import',
    href: tenantConsole.elastic,
    icon: Boxes,
    description: 'Connect to external servers from any provider via secure browser console',
  },
  {
    serviceKey: 'my-vms',
    name: 'My VM Dashboard',
    href: tenantConsole.myVmDashboard,
    icon: LayoutList,
    description: 'Read-only view of all assigned external servers — assignees, schedules and status',
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
];

/** Workspace tools / utilities. */
const TOOL_TILES: HubTile[] = [
  {
    serviceKey: 'projects',
    name: 'Projects',
    href: tenantConsole.projects,
    icon: FolderKanban,
    description: 'Create client projects to group resources and track costs',
  },
  {
    serviceKey: 'billing',
    name: 'Billing',
    href: tenantVps.billing,
    icon: Wallet,
    description: 'Manage your wallet balance, top up, and view transaction history',
  },
  {
    serviceKey: 'gcp',
    name: 'GCP Services',
    href: tenantConsole.gcp,
    icon: Cloud,
    description: 'Google Cloud access management, provisioning, and lab environments.',
  },
  {
    serviceKey: 'docs',
    name: 'Documentation',
    href: tenantConsole.docs,
    icon: BookOpen,
    description: 'Guides for the product services enabled in this workspace',
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

function TileGrid({
  tiles,
  accentColor,
}: {
  tiles: HubTile[];
  accentColor: string;
}) {
  return (
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
  );
}

export default function TenantConsolePage() {
  const router = useRouter();
  const { tenantUser } = useTenantAuth();
  const { accentColor, portalName } = useTenantBranding();
  const { loading, hasActiveService } = useTenantServices();
  const { loading: rbacLoading, isConsoleStaff, hasPermission, isTenantAdmin } = useTenantRbac();

  useEffect(() => {
    if (rbacLoading) return;
    if (tenantUser?.role === 'tenant_user' && !isConsoleStaff) {
      router.replace(tenantVps.vms);
    }
  }, [router, tenantUser?.role, isConsoleStaff, rbacLoading]);

  const filterTile = (tile: HubTile): boolean => {
    if (isServiceHiddenFromUi(tile.serviceKey)) return false;
    // Docs is always available; topics inside filter to enabled products.
    if (tile.serviceKey === 'docs') return true;
    if (
      tile.serviceKey !== 'billing' &&
      tile.serviceKey !== 'projects' &&
      tile.serviceKey !== 'access-control' &&
      !hasActiveService(tile.serviceKey as TenantServiceKey)
    ) {
      if (tile.serviceKey === 'machine-manager') {
        return hasActiveService(tile.serviceKey);
      }
      return false;
    }
    if (tile.serviceKey === 'access-control') {
      return isTenantAdmin || hasPermission('rbac.roles.write', 'rbac.assign');
    }
    return canAccessTenantHubTile(tile.serviceKey, hasPermission, isTenantAdmin);
  };

  const productTiles = useMemo(() => PRODUCT_TILES.filter(filterTile), [
    hasActiveService,
    hasPermission,
    isTenantAdmin,
  ]);
  const toolTiles = useMemo(() => TOOL_TILES.filter(filterTile), [
    hasActiveService,
    hasPermission,
    isTenantAdmin,
  ]);

  if (loading || rbacLoading || (tenantUser?.role === 'tenant_user' && !isConsoleStaff)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin" style={{ color: accentColor }} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-screen-xl space-y-10">
      <section>
        <h1 className="mb-1 text-2xl font-bold text-gray-900">{portalName} services</h1>
        <p className="mb-5 text-sm text-gray-500">Product services enabled for this workspace.</p>
        {productTiles.length === 0 ? (
          <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            No product services are enabled yet.
          </p>
        ) : (
          <TileGrid tiles={productTiles} accentColor={accentColor} />
        )}
      </section>

      {toolTiles.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold text-gray-900">Tools &amp; workspace</h2>
          <p className="mb-5 text-sm text-gray-500">
            Billing, projects, documentation, machine manager, and access control.
          </p>
          <TileGrid tiles={toolTiles} accentColor={accentColor} />
        </section>
      )}

      <TenantRecentResources />
    </div>
  );
}
