'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Inbox, LogOut, Ticket } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface SupportAgentSidebarProps {
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
}

const navItems = [
  { href: '/support-agent', label: 'My Queue', icon: Inbox, exact: true },
  { href: '/support-agent/tickets', label: 'All My Tickets', icon: Ticket, exact: false },
] as const;

export function SupportAgentSidebar({ sidebarOpen, onCloseSidebar }: SupportAgentSidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

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
        className={`fixed left-0 top-0 z-30 flex h-full flex-col border-r border-gray-200 bg-white shadow-sm transition-all duration-300 ${
          sidebarOpen
            ? 'w-60 translate-x-0'
            : 'w-0 -translate-x-full overflow-hidden lg:w-0 lg:translate-x-0'
        }`}
      >
        <div className="flex h-full min-w-[15rem] flex-col">
          <div className="border-b border-gray-100 px-5 py-5">
            <Link
              href="/support-agent"
              className="inline-flex items-center gap-3 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C] focus-visible:ring-offset-2"
            >
              <span className="relative h-11 w-12 shrink-0 overflow-hidden rounded-md">
                <Image
                  src="/images/racko-logo1.png"
                  alt=""
                  width={148}
                  height={40}
                  priority
                  aria-hidden
                  className="absolute left-0 top-0 h-11 w-auto max-w-none"
                />
              </span>
              <span className="text-xl font-bold tracking-tight text-gray-900">Racko</span>
            </Link>
            <p className="mt-3 text-xs text-gray-400">Support Agent Console</p>
          </div>

          <nav className="scrollbar-white flex-1 overflow-y-auto p-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.exact ? pathname === item.href : pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`mt-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-red-50 text-[#B91C1C]'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${isActive ? 'text-[#B91C1C]' : 'text-gray-400'}`}
                  />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-gray-100 p-4">
            <p className="truncate text-sm font-medium text-gray-900">
              {user?.name?.trim() || user?.email}
            </p>
            {user?.name ? (
              <p className="truncate text-xs text-gray-500">{user.email}</p>
            ) : null}
            <button
              type="button"
              onClick={() => void logout()}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
