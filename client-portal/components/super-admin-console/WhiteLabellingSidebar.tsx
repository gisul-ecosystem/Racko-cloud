'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, ChevronLeft, ClipboardList, LayoutDashboard, type LucideIcon } from 'lucide-react';
import { fetchSuperAdminOrders } from '@/lib/tenantApi';

interface WhiteLabellingSidebarProps {
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
}

type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact: boolean;
  showPendingBadge?: boolean;
};

const navLinks: NavLink[] = [
  {
    href: '/super-admin-console/white-labelling',
    label: 'Overview',
    icon: LayoutDashboard,
    exact: true,
  },
  {
    href: '/super-admin-console/white-labelling/tenants',
    label: 'Tenants',
    icon: Building2,
    exact: false,
  },
  {
    href: '/super-admin-console/white-labelling/orders',
    label: 'Orders',
    icon: ClipboardList,
    exact: false,
    showPendingBadge: true,
  },
];

export function WhiteLabellingSidebar({ sidebarOpen, onCloseSidebar }: WhiteLabellingSidebarProps) {
  const pathname = usePathname();
  const [pendingOrderCount, setPendingOrderCount] = useState(0);

  const loadPendingOrderCount = useCallback(async () => {
    try {
      const orders = await fetchSuperAdminOrders('pending_approval');
      setPendingOrderCount(orders.length);
    } catch {
      setPendingOrderCount(0);
    }
  }, []);

  useEffect(() => {
    void loadPendingOrderCount();
    const interval = setInterval(() => void loadPendingOrderCount(), 30_000);
    return () => clearInterval(interval);
  }, [loadPendingOrderCount, pathname]);

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
            <p className="text-sm font-semibold text-gray-900">White Labelling</p>
            <p className="mt-0.5 text-xs text-gray-400">Tenant management</p>
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
            {navLinks.map(({ href, label, icon: Icon, exact, showPendingBadge }) => {
              const isActive = exact ? pathname === href : pathname?.startsWith(href);
              const badgeCount = showPendingBadge ? pendingOrderCount : 0;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-red-50 text-[#B91C1C]'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${isActive ? 'text-[#B91C1C]' : 'text-gray-400'}`}
                  />
                  <span className="flex-1">{label}</span>
                  {badgeCount > 0 ? (
                    <span
                      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold leading-none ${
                        isActive ? 'bg-[#B91C1C] text-white' : 'bg-red-100 text-[#B91C1C]'
                      }`}
                      aria-label={`${badgeCount} pending order${badgeCount === 1 ? '' : 's'}`}
                    >
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-gray-100 p-3">
            <Link
              href="/super-admin-console"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
            >
              <ChevronLeft className="h-4 w-4 text-gray-400" />
              All services
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}
