'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, MonitorCheck, Cloud } from 'lucide-react';

interface SuperAdminConsoleSidebarProps {
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
}

const navItems = [
  { href: '/super-admin-console', label: 'All services', icon: LayoutGrid, exact: true },
  { href: '/super-admin-console/vm-management', label: 'VM Management', icon: MonitorCheck, exact: false },
  { href: '/super-admin-console/azure', label: 'Azure Services', icon: Cloud, exact: false },
];

export function SuperAdminConsoleSidebar({ sidebarOpen, onCloseSidebar }: SuperAdminConsoleSidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {sidebarOpen && (
        <button type="button" aria-label="Close sidebar" className="fixed inset-0 z-20 bg-black/20 lg:hidden" onClick={onCloseSidebar} />
      )}
      <aside className={`fixed left-0 top-0 z-30 flex h-full flex-col border-r border-gray-200 bg-white shadow-sm transition-all duration-300 ${sidebarOpen ? 'w-60 translate-x-0' : 'w-0 -translate-x-full overflow-hidden lg:w-0 lg:translate-x-0'}`}>
        <div className="flex h-full min-w-[15rem] flex-col">
          <div className="border-b border-gray-100 px-5 py-5">
            <p className="text-sm font-semibold text-gray-900">Super Admin Console</p>
            <p className="mt-0.5 text-xs text-gray-400">Choose a service</p>
          </div>
          <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
            {navItems.map(({ href, label, icon: Icon, exact }) => {
              const isActive = exact ? pathname === href : pathname?.startsWith(href);
              return (
                <Link key={href} href={href} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? 'bg-red-50 text-[#B91C1C]' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                  <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-[#B91C1C]' : 'text-gray-400'}`} />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>
    </>
  );
}
