'use client';

import Link from 'next/link';
import {
  Cloud,
  FlaskConical,
  Globe,
  LayoutList,
  Server,
  Wallet,
  Monitor,
  SquarePlus,
  HardDrive,
  Loader2,
  Shield,
  FolderKanban,
  BookOpen,
} from 'lucide-react';
import { RecentResourcesTable } from '../../components/console/RecentResourcesTable';
import { AZURE_ROUTES, AZURE_SERVICE } from '../../cloud_automation/constants';
import { AWS_ROUTES, AWS_SERVICE } from '../../cloud_automation_aws/constants';
import { GCP_ROUTES, GCP_SERVICE } from '../../cloud_automation_gcp/constants';
import { CLOUD_LABS_ROUTES, CLOUD_LABS_SERVICE } from '../../cloud_automation_training/constants';
import { useAdminServices } from '@/context/AdminServicesContext';
import { CONSOLE_TILE_SERVICE_KEY } from '@/lib/adminServicesApi';
import { isServiceHiddenFromUi } from '@/lib/hiddenServices';

type HubTile = {
  id: string;
  name: string;
  href: string;
  icon: typeof Server;
  description: string;
};

/** Product entitlements — gated by admin_service_configs. */
const productServices: HubTile[] = [
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
    id: 'elastic',
    name: 'Elastic Server Import',
    href: '/console/elastic-servers',
    icon: Globe,
    description: 'Connect to external servers from any provider via secure browser console',
  },
  {
    id: 'my-vm-dashboard',
    name: 'My VM Dashboard',
    href: '/console/my-vm-dashboard',
    icon: LayoutList,
    description: 'Read-only view of all your assigned external servers — assignees, schedules and status',
  },
  {
    id: CLOUD_LABS_SERVICE.id,
    name: CLOUD_LABS_SERVICE.name,
    href: CLOUD_LABS_ROUTES.hub,
    icon: FlaskConical,
    description: CLOUD_LABS_SERVICE.description,
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
    icon: Cloud,
    description: GCP_SERVICE.description,
  },
];

/** Always-available org tools / utilities (not sold product entitlements). */
const platformTools: HubTile[] = [
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
    id: 'docs',
    name: 'Documentation',
    href: '/console/docs',
    icon: BookOpen,
    description: 'Guides for the product services enabled on your account',
  },
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

function isTileVisible(
  tile: HubTile,
  hasActiveService: (key: import('@/lib/adminServicesApi').AdminServiceKey) => boolean
): boolean {
  if (isServiceHiddenFromUi(tile.id)) return false;
  if (
    tile.id === 'access-control' ||
    tile.id === 'billing' ||
    tile.id === 'projects' ||
    tile.id === 'docs'
  ) {
    return true;
  }
  const key = CONSOLE_TILE_SERVICE_KEY[tile.id];
  if (key === null || key === undefined) return true;
  if (isServiceHiddenFromUi(key)) return false;
  return hasActiveService(key);
}

function TileGrid({ tiles }: { tiles: HubTile[] }) {
  return (
    <div className="flex flex-wrap justify-center gap-6">
      {tiles.map((service) => {
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
  );
}

export default function ConsolePage() {
  const { loading, hasActiveService } = useAdminServices();

  const visibleProducts = productServices.filter((t) => isTileVisible(t, hasActiveService));
  const visibleTools = platformTools.filter((t) => isTileVisible(t, hasActiveService));

  return (
    <div className="mx-auto max-w-screen-xl space-y-10">
      <section>
        <h1 className="mb-1 text-2xl font-bold text-gray-900">Racko.ai services</h1>
        <p className="mb-5 text-sm text-gray-500">
          Product services enabled for your organization.
        </p>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
          </div>
        ) : visibleProducts.length === 0 ? (
          <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            No product services are enabled yet. Ask a Super Admin to assign services to your account.
          </p>
        ) : (
          <TileGrid tiles={visibleProducts} />
        )}
      </section>

      {!loading && visibleTools.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold text-gray-900">Tools &amp; workspace</h2>
          <p className="mb-5 text-sm text-gray-500">
            Billing, projects, documentation, machine manager, and access control.
          </p>
          <TileGrid tiles={visibleTools} />
        </section>
      )}

      <RecentResourcesTable />
    </div>
  );
}
