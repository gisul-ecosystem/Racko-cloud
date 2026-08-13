'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Boxes,
  Cloud,
  FlaskConical,
  FolderKanban,
  HardDrive,
  LayoutDashboard,
  LayoutGrid,
  BookOpen,
  Monitor,
  Server,
  Shield,
  SquarePlus,
  LayoutList,
  Wallet,
} from 'lucide-react';
import { AZURE_ROUTES, AZURE_SERVICE } from '../../cloud_automation/constants';
import { AWS_ROUTES, AWS_SERVICE } from '../../cloud_automation_aws/constants';
import { CLOUD_LABS_ROUTES, CLOUD_LABS_SERVICE } from '../../cloud_automation_training/constants';
import { useAdminServices } from '@/context/AdminServicesContext';
import { CONSOLE_TILE_SERVICE_KEY, type AdminServiceKey } from '@/lib/adminServicesApi';
import { isServiceHiddenFromUi } from '@/lib/hiddenServices';
import { useConsoleShell } from './ConsoleContext';

type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: typeof Server;
};

const PRODUCT_LINKS: NavItem[] = [
  { id: 'vps', label: 'VPS Hosting', href: '/dashboard/admin', icon: Server },
  { id: 'create-vm', label: 'VM Catalog', href: '/console/create-vm', icon: SquarePlus },
  {
    id: 'dedicated-server',
    label: 'Dedicated Server',
    href: '/console/dedicated-server',
    icon: HardDrive,
  },
  { id: 'elastic', label: 'Elastic Servers', href: '/console/elastic-servers', icon: Boxes },
  {
    id: CLOUD_LABS_SERVICE.id,
    label: CLOUD_LABS_SERVICE.name,
    href: CLOUD_LABS_ROUTES.hub,
    icon: FlaskConical,
  },
  {
    id: AZURE_SERVICE.id,
    label: AZURE_SERVICE.name,
    href: AZURE_ROUTES.dashboard,
    icon: Cloud,
  },
  {
    id: AWS_SERVICE.id,
    label: AWS_SERVICE.name,
    href: AWS_ROUTES.dashboard,
    icon: Server,
  },
];

const TOOL_LINKS: NavItem[] = [
  { id: 'billing', label: 'Billing', href: '/dashboard/admin/billing', icon: Wallet },
  { id: 'projects', label: 'Projects', href: '/console/projects', icon: FolderKanban },
  { id: 'docs', label: 'Documentation', href: '/console/docs', icon: BookOpen },
  {
    id: 'machine-manager',
    label: 'Machine Manager',
    href: '/console/machine-manager',
    icon: Monitor,
  },
  {
    id: 'access-control',
    label: 'Access control',
    href: '/console/access-control',
    icon: Shield,
  },
];

function isLinkVisible(
  item: NavItem,
  hasActiveService: (key: AdminServiceKey) => boolean
): boolean {
  if (isServiceHiddenFromUi(item.id)) return false;
  // Docs is always available; topics inside filter to enabled products.
  if (
    item.id === 'access-control' ||
    item.id === 'billing' ||
    item.id === 'projects' ||
    item.id === 'docs'
  ) {
    return true;
  }
  const key = CONSOLE_TILE_SERVICE_KEY[item.id];
  if (key === null || key === undefined) return true;
  if (isServiceHiddenFromUi(key)) return false;
  return hasActiveService(key);
}

function NavLink({
  item,
  pathname,
}: {
  item: NavItem;
  pathname: string;
}) {
  const Icon = item.icon;
  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <Link
      href={item.href}
      className={`mt-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
        isActive
          ? 'bg-red-50 text-[#B91C1C]'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
      }`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-[#B91C1C]' : 'text-gray-400'}`} />
      {item.label}
    </Link>
  );
}

export function ConsoleSidebar() {
  const pathname = usePathname() ?? '';
  const { sidebarOpen, setSidebarOpen } = useConsoleShell();
  const { hasActiveService } = useAdminServices();

  const products = PRODUCT_LINKS.filter((l) => isLinkVisible(l, hasActiveService));
  const tools = TOOL_LINKS.filter((l) => isLinkVisible(l, hasActiveService));
  const hubActive = pathname === '/console' || pathname === '/console/';
  const overviewActive =
    pathname === '/console/overview' || pathname.startsWith('/console/overview/');
  const myVirtualMachinesActive =
    pathname === '/console/my-vm-dashboard' || pathname.startsWith('/console/my-vm-dashboard/');

  return (
    <>
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-20 bg-black/20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-30 flex h-full flex-col border-r border-gray-200 bg-white shadow-sm transition-all duration-300 ${
          sidebarOpen
            ? 'w-60 translate-x-0'
            : 'w-0 -translate-x-full overflow-hidden lg:w-0 lg:translate-x-0'
        }`}
      >
        <div className="flex h-full min-w-[15rem] flex-col">
          <div className="border-b border-gray-100 px-5 py-5">
            <p className="text-sm font-semibold text-gray-900">Services console</p>
            <p className="mt-0.5 text-xs text-gray-400">Services and workspace tools</p>
          </div>

          <nav className="scrollbar-white flex-1 overflow-y-auto p-3">
            <Link
              href="/console/overview"
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                overviewActive
                  ? 'bg-red-50 text-[#B91C1C]'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <LayoutDashboard
                className={`h-4 w-4 shrink-0 ${overviewActive ? 'text-[#B91C1C]' : 'text-gray-400'}`}
              />
              Overview
            </Link>

            <Link
              href="/console/my-vm-dashboard"
              className={`mt-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                myVirtualMachinesActive
                  ? 'bg-red-50 text-[#B91C1C]'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <LayoutList
                className={`h-4 w-4 shrink-0 ${myVirtualMachinesActive ? 'text-[#B91C1C]' : 'text-gray-400'}`}
              />
              My Virtual Machines
            </Link>

            <Link
              href="/console"
              className={`mt-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                hubActive
                  ? 'bg-red-50 text-[#B91C1C]'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <LayoutGrid
                className={`h-4 w-4 shrink-0 ${hubActive ? 'text-[#B91C1C]' : 'text-gray-400'}`}
              />
              All services
            </Link>

            {products.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  Services
                </p>
                {products.map((item) => (
                  <NavLink key={item.id} item={item} pathname={pathname} />
                ))}
              </div>
            )}

            {tools.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  Tools
                </p>
                {tools.map((item) => (
                  <NavLink key={item.id} item={item} pathname={pathname} />
                ))}
              </div>
            )}
          </nav>
        </div>
      </aside>
    </>
  );
}
