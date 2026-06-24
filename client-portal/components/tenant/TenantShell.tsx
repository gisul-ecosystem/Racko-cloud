'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronLeft,
  History,
  LogOut,
  PlusCircle,
  Wallet,
} from 'lucide-react';
import { useTenantAuth } from '../../context/TenantAuthContext';
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
  { href: '/tenant/dashboard/wallet', label: 'Wallet', icon: Wallet },
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
];

export function TenantShell({ children }: TenantShellProps) {
  const pathname = usePathname();
  const { tenantUser, logout } = useTenantAuth();

  const visibleNav = navItems.filter(
    (item) => !item.roles || (tenantUser && item.roles.includes(tenantUser.role))
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-screen-xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">Tenant Portal</p>
            <p className="text-xs text-gray-500">{tenantUser?.email}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-50"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-screen-xl px-6 py-6">
        <nav className="mb-6 flex flex-wrap gap-2">
          {visibleNav.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname?.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-red-50 text-[#B91C1C]'
                    : 'text-gray-600 hover:bg-white hover:text-gray-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        {tenantUser?.role === 'tenant_user' && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            You have read-only access. Contact your tenant admin to place orders or add funds.
          </div>
        )}

        {children}
      </div>

      <div className="border-t border-gray-100 px-6 py-4">
        <Link
          href="/tenant/login"
          className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-[#B91C1C]"
        >
          <ChevronLeft className="h-3 w-3" />
          Tenant login
        </Link>
      </div>
    </div>
  );
}
