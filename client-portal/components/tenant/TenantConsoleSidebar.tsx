'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Boxes, Cloud, HardDrive, LayoutGrid, Monitor, PlusCircle, Server, Shield, Wallet } from 'lucide-react';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { useTenantServices } from '@/context/TenantServicesContext';
import { useTenantRbac } from '@/context/TenantRbacContext';
import { hexToRgba } from '@/lib/tenantAccentStyles';
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

const SHORTCUTS: Array<{
  serviceKey: TenantServiceKey | 'billing';
  label: string;
  href: string;
  icon: React.ReactNode;
}> = [
  {
    serviceKey: 'vm-management',
    label: 'VPS Hosting',
    href: tenantVps.overview,
    icon: <Server className="h-4 w-4 shrink-0" />,
  },
  {
    serviceKey: 'create-vm',
    label: 'VM Catalog',
    href: tenantConsole.createVm,
    icon: <PlusCircle className="h-4 w-4 shrink-0" />,
  },
  {
    serviceKey: 'dedicated-server',
    label: 'Dedicated Server',
    href: tenantConsole.dedicatedServer,
    icon: <HardDrive className="h-4 w-4 shrink-0" />,
  },
  {
    serviceKey: 'billing',
    label: 'Billing',
    href: tenantVps.billing,
    icon: <Wallet className="h-4 w-4 shrink-0" />,
  },
  {
    serviceKey: 'elastic-servers',
    label: 'Elastic Servers',
    href: tenantConsole.elastic,
    icon: <Boxes className="h-4 w-4 shrink-0" />,
  },
  {
    serviceKey: 'azure',
    label: 'Azure Services',
    href: tenantConsole.azure,
    icon: <Cloud className="h-4 w-4 shrink-0" />,
  },
  {
    serviceKey: 'machine-manager',
    label: 'Machine Manager',
    href: tenantConsole.machineManager,
    icon: <Monitor className="h-4 w-4 shrink-0" />,
  },
];

const ADMIN_LINKS = [
  {
    label: 'Access control',
    href: tenantConsole.accessControl,
    icon: <Shield className="h-4 w-4 shrink-0" />,
  },
];

export function TenantConsoleSidebar({ sidebarOpen, onCloseSidebar }: TenantConsoleSidebarProps) {
  const pathname = usePathname() ?? '';
  const { accentColor } = useTenantBranding();
  const { hasActiveService } = useTenantServices();
  const { isTenantAdmin, hasPermission } = useTenantRbac();

  const links = SHORTCUTS.filter((l) => {
    if (l.serviceKey === 'billing') return hasPermission('wallet.read', 'wallet.topup');
    return hasActiveService(l.serviceKey);
  });

  const showAccessControl =
    isTenantAdmin || hasPermission('rbac.roles.write', 'rbac.assign');

  const hubActive = pathname === TENANT_CONSOLE || pathname === `${TENANT_CONSOLE}/`;

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
            <p className="mt-0.5 text-xs text-gray-400">Choose an available service</p>
          </div>

          <nav className="flex-1 overflow-y-auto p-3">
            <Link
              href={TENANT_CONSOLE}
              onClick={() => closeIfMobile(onCloseSidebar)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
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

            {links.map((link) => {
              const isActive =
                pathname === link.href || pathname.startsWith(`${link.href}/`);
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
                  <span style={isActive ? { color: accentColor } : undefined} className={isActive ? '' : 'text-gray-400'}>
                    {link.icon}
                  </span>
                  {link.label}
                </Link>
              );
            })}

            {showAccessControl
              ? ADMIN_LINKS.map((link) => {
                  const isActive =
                    pathname === link.href || pathname.startsWith(`${link.href}/`);
                  return (
                    <Link
                      key={link.href}
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
                })
              : null}
          </nav>
        </div>
      </aside>
    </>
  );
}
