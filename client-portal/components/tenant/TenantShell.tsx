'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  History,
  LogOut,
  PlusCircle,
  Server,
  User,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { useTenantAuth } from '../../context/TenantAuthContext';
import { useTenantBranding } from '../../context/TenantBrandingContext';
import { TenantNotificationBell } from './TenantNotificationBell';
import { tenantAccentSurface } from '../../lib/tenantAccentStyles';
import type { TenantUserRole } from '../../types/tenantPortal';

interface TenantShellProps {
  children: React.ReactNode;
}

const navItems: Array<{
  href: string;
  label: string;
  icon: typeof Wallet;
  roles?: TenantUserRole[];
}> = [
  { href: '/tenant/dashboard/vms', label: 'VMs', icon: Server },
  {
    href: '/tenant/dashboard/vms/onboard',
    label: 'Onboard',
    icon: UserPlus,
    roles: ['tenant_admin'],
  },
  {
    href: '/tenant/dashboard/users',
    label: 'Users',
    icon: Users,
    roles: ['tenant_admin'],
  },
  { href: '/tenant/dashboard/wallet', label: 'Wallet', icon: Wallet, roles: ['tenant_admin'] },
  {
    href: '/tenant/dashboard/plans',
    label: 'VM Plans',
    icon: Server,
    roles: ['tenant_admin'],
  },
  {
    href: '/tenant/dashboard/orders/new',
    label: 'Place Order',
    icon: PlusCircle,
    roles: ['tenant_admin'],
  },
  {
    href: '/tenant/dashboard/orders',
    label: 'Order History',
    icon: History,
    roles: ['tenant_admin'],
  },
  {
    href: '/tenant/dashboard/profile',
    label: 'Profile',
    icon: User,
    roles: ['tenant_admin'],
  },
];

function isTenantNavActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;

  if (href === '/tenant/dashboard/orders') {
    return (
      pathname.startsWith('/tenant/dashboard/orders/') &&
      !pathname.startsWith('/tenant/dashboard/orders/new')
    );
  }

  if (href === '/tenant/dashboard/orders/new') {
    return pathname === href;
  }

  if (href === '/tenant/dashboard/vms') {
    return (
      pathname.startsWith('/tenant/dashboard/vms/') &&
      !pathname.startsWith('/tenant/dashboard/vms/onboard')
    );
  }

  if (href === '/tenant/dashboard/vms/onboard') {
    return pathname === href;
  }

  return pathname.startsWith(`${href}/`);
}

export function TenantShell({ children }: TenantShellProps) {
  const pathname = usePathname();
  const { tenantUser, logout } = useTenantAuth();
  const { logoSrc, accentColor } = useTenantBranding();

  const visibleNav = navItems.filter(
    (item) => !item.roles || (tenantUser && item.roles.includes(tenantUser.role))
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-screen-xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            {logoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoSrc} alt="Tenant logo" className="h-8 max-w-[140px] object-contain" />
            ) : null}
            <div>
              <p className="text-sm font-semibold text-gray-900">Tenant Portal</p>
              <p className="text-xs text-gray-500">{tenantUser?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TenantNotificationBell />
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-50"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-screen-xl px-6 py-6">
        <nav className="mb-6 flex flex-wrap gap-2">
          {visibleNav.map(({ href, label, icon: Icon }) => {
            const isActive = pathname ? isTenantNavActive(pathname, href) : false;
            return (
              <Link
                key={href}
                href={href}
                className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'border text-gray-900'
                    : 'border border-transparent text-gray-600 hover:border-gray-200 hover:bg-white hover:text-gray-900'
                }`}
                style={isActive ? tenantAccentSurface(accentColor) : undefined}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        {children}
      </div>
    </div>
  );
}
