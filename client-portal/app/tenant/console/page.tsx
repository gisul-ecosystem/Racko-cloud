'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  BookOpen,
  Boxes,
  Cloud,
  Globe,
  HardDrive,
  Loader2,
  Monitor,
  PlusCircle,
  Server,
  Wallet,
} from 'lucide-react';
import { TenantRecentResources } from '@/components/tenant/TenantRecentResources';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { useTenantServices } from '@/context/TenantServicesContext';
import { hexToRgba } from '@/lib/tenantAccentStyles';
import { tenantConsole, tenantVps } from '@/lib/tenantAdminRoutes';
import type { TenantServiceKey } from '@/types/tenantPortal';

const SERVICE_TILES: Array<{
  serviceKey: TenantServiceKey | 'billing';
  name: string;
  href: string;
  description: string;
  icon: typeof Server;
}> = [
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
    serviceKey: 'gcp',
    name: 'GCP Services',
    href: tenantConsole.gcp,
    icon: Globe,
    description: 'Google Cloud access management, provisioning, and lab environments.',
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
];

export default function TenantConsolePage() {
  const router = useRouter();
  const { tenantUser } = useTenantAuth();
  const { accentColor, portalName } = useTenantBranding();
  const { loading, hasActiveService } = useTenantServices();
  const isAdmin = tenantUser?.role === 'tenant_admin';

  useEffect(() => {
    if (tenantUser?.role === 'tenant_user') {
      router.replace(tenantVps.vms);
    }
  }, [router, tenantUser?.role]);

  const tiles = SERVICE_TILES.filter((tile) => {
    if (tile.serviceKey === 'billing') return isAdmin;
    return hasActiveService(tile.serviceKey);
  });

  if (loading || tenantUser?.role === 'tenant_user') {
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
