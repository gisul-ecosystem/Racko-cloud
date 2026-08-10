'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Boxes,
  Cloud,
  HardDrive,
  LayoutDashboard,
  LayoutGrid,
  Monitor,
  PlusCircle,
  Server,
  Shield,
  Wallet,
  FolderKanban,
  BookOpen,
} from 'lucide-react';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { useTenantServices } from '@/context/TenantServicesContext';
import { useTenantRbac } from '@/context/TenantRbacContext';
import { hexToRgba } from '@/lib/tenantAccentStyles';
import { canAccessTenantHubTile, canAccessTenantService } from '@/lib/tenantServicePermissions';
import { TENANT_CONSOLE, tenantConsole, tenantVps } from '@/lib/tenantAdminRoutes';
import type { TenantServiceKey } from '@/types/tenantPortal';

interface TenantConsoleSidebarProps {
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
}

function closeIfMobile(onCloseSidebar: () => void) {
  if (typeof window === 'undefined') return;
  if (window.matchMedia('(max-width: 1023px)').matches) {
    onCloseSidebar();
  }
}

type Shortcut = {
  serviceKey: TenantServiceKey | 'billing' | 'projects' | 'access-control' | 'docs';
  label: string;
  href: string;
  icon: React.ReactNode;
  section: 'services' | 'tools';
};

const SHORTCUTS: Shortcut[] = [
  {
    serviceKey: 'vm-management',
    label: 'VPS Hosting',
    href: tenantVps.overview,
    icon: <Server className="h-4 w-4 shrink-0" />,
    section: 'services',
  },
  {
    serviceKey: 'create-vm',
    label: 'VM Catalog',
    href: tenantConsole.createVm,
    icon: <PlusCircle className="h-4 w-4 shrink-0" />,
    section: 'services',
  },
  {
    serviceKey: 'dedicated-server',
    label: 'Dedicated Server',
    href: tenantConsole.dedicatedServer,
    icon: <HardDrive className="h-4 w-4 shrink-0" />,
    section: 'services',
  },
  {
    serviceKey: 'elastic-servers',
    label: 'Elastic Servers',
    href: tenantConsole.elastic,
    icon: <Boxes className="h-4 w-4 shrink-0" />,
    section: 'services',
  },
  {
    serviceKey: 'azure',
    label: 'Azure Services',
    href: tenantConsole.azure,
    icon: <Cloud className="h-4 w-4 shrink-0" />,
    section: 'services',
  },
  {
    serviceKey: 'projects',
    label: 'Projects',
    href: tenantConsole.projects,
    icon: <FolderKanban className="h-4 w-4 shrink-0" />,
    section: 'tools',
  },
  {
    serviceKey: 'billing',
    label: 'Billing',
    href: tenantVps.billing,
    icon: <Wallet className="h-4 w-4 shrink-0" />,
    section: 'tools',
  },
  {
    serviceKey: 'docs',
    label: 'Documentation',
    href: tenantConsole.docs,
    icon: <BookOpen className="h-4 w-4 shrink-0" />,
    section: 'tools',
  },
  {
    serviceKey: 'machine-manager',
    label: 'Machine Manager',
    href: tenantConsole.machineManager,
    icon: <Monitor className="h-4 w-4 shrink-0" />,
    section: 'tools',
  },
  {
    serviceKey: 'access-control',
    label: 'Access control',
    href: tenantConsole.accessControl,
    icon: <Shield className="h-4 w-4 shrink-0" />,
    section: 'tools',
  },
];

export function TenantConsoleSidebar({ sidebarOpen, onCloseSidebar }: TenantConsoleSidebarProps) {
  const pathname = usePathname() ?? '';
  const { accentColor } = useTenantBranding();
  const { hasActiveService } = useTenantServices();
  const { isTenantAdmin, hasPermission } = useTenantRbac();

  const links = SHORTCUTS.filter((l) => {
    if (l.serviceKey === 'billing' || l.serviceKey === 'projects' || l.serviceKey === 'docs') {
      return l.serviceKey === 'docs'
        ? true
        : canAccessTenantHubTile(l.serviceKey, hasPermission, isTenantAdmin);
    }
    if (l.serviceKey === 'access-control') {
      return isTenantAdmin || hasPermission('rbac.roles.write', 'rbac.assign');
    }
    if (!hasActiveService(l.serviceKey)) return false;
    return canAccessTenantService(l.serviceKey, hasPermission, isTenantAdmin);
  });

  const productLinks = links.filter((l) => l.section === 'services');
  const toolLinks = links.filter((l) => l.section === 'tools');

  // Always show Overview in the hub sidebar for tenant admins/operators.
  const hubActive = pathname === TENANT_CONSOLE || pathname === `${TENANT_CONSOLE}/`;
  const overviewActive =
    pathname === tenantConsole.overview || pathname.startsWith(`${tenantConsole.overview}/`);

  function renderLink(link: Shortcut) {
    const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
    return (
      <Link
        key={link.serviceKey}
        href={link.href}
        onClick={() => closeIfMobile(onCloseSidebar)}
        className={`mt-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
          isActive ? '' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }`}
        style={
          isActive
            ? { backgroundColor: hexToRgba(accentColor, 0.1), color: accentColor }
            : undefined
        }
      >
        <span
          style={isActive ? { color: accentColor } : undefined}
          className={isActive ? '' : 'text-gray-400'}
        >
          {link.icon}
        </span>
        {link.label}
      </Link>
    );
  }

  return (
    <>
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-20 bg-black/20 lg:hidden"
          onClick={onCloseSidebar}
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-30 flex h-full w-60 flex-col border-r border-gray-200 bg-white shadow-sm transition-all duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:w-0 lg:overflow-hidden'
        }`}
      >
        <div className="flex h-full min-w-[15rem] flex-col">
          <div className="border-b border-gray-100 px-5 py-5">
            <p className="text-sm font-semibold text-gray-900">Services console</p>
            <p className="mt-0.5 text-xs text-gray-400">Services and workspace tools</p>
          </div>

          <nav className="scrollbar-white flex-1 overflow-y-auto p-3">
            <Link
              href={tenantConsole.overview}
              onClick={() => closeIfMobile(onCloseSidebar)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
              style={
                overviewActive
                  ? { backgroundColor: hexToRgba(accentColor, 0.1), color: accentColor }
                  : undefined
              }
            >
              <LayoutDashboard
                className="h-4 w-4 shrink-0"
                style={{ color: overviewActive ? accentColor : undefined }}
              />
              <span className={overviewActive ? '' : 'text-gray-600'}>Overview</span>
            </Link>

            <Link
              href={TENANT_CONSOLE}
              onClick={() => closeIfMobile(onCloseSidebar)}
              className="mt-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
              style={
                hubActive
                  ? { backgroundColor: hexToRgba(accentColor, 0.1), color: accentColor }
                  : undefined
              }
            >
              <LayoutGrid
                className="h-4 w-4 shrink-0"
                style={{ color: hubActive ? accentColor : undefined }}
              />
              <span className={hubActive ? '' : 'text-gray-600'}>All services</span>
            </Link>

            {productLinks.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  Services
                </p>
                {productLinks.map(renderLink)}
              </div>
            )}

            {toolLinks.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  Tools
                </p>
                {toolLinks.map(renderLink)}
              </div>
            )}
          </nav>
        </div>
      </aside>
    </>
  );
}
