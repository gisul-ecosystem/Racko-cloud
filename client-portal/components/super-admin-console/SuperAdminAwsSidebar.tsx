'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, Shield } from 'lucide-react';

interface SuperAdminAwsSidebarProps {
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
}

const navLinks = [
  {
    href: '/super-admin-console/aws/org-admin',
    label: 'Lab Management',
    icon: Shield,
    exact: true,
  },
];

export function SuperAdminAwsSidebar({ sidebarOpen, onCloseSidebar }: SuperAdminAwsSidebarProps) {
  const pathname = usePathname();

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
        className={`fixed left-0 top-0 z-30 flex h-full w-60 flex-col border-r border-gray-200 bg-white shadow-sm transition-all duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:w-0 lg:overflow-hidden'}`}
      >
        <div className="flex h-full min-w-[15rem] flex-col">
          <div className="border-b border-gray-100 px-5 py-5">
            <p className="text-sm font-semibold text-gray-900">AWS Services</p>
            <p className="mt-0.5 text-xs text-gray-400">Cloud service management</p>
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
            {navLinks.map(({ href, label, icon: Icon, exact }) => {
              const isActive = exact ? pathname === href : pathname?.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? 'bg-red-50 text-[#B91C1C]' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${isActive ? 'text-[#B91C1C]' : 'text-gray-400'}`}
                  />
                  {label}
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
