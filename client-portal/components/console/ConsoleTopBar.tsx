'use client';

import { Menu, Search } from 'lucide-react';
import { useConsoleShell } from './ConsoleContext';
import { NotificationBell } from './NotificationBell';
import { ConsoleProfileMenu } from './ConsoleProfileMenu';

export function ConsoleTopBar() {
  const { searchQuery, setSearchQuery, toggleSidebar } = useConsoleShell();

  return (
    <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
      <div className="flex h-16 items-center gap-4 px-6">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Toggle sidebar"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="hidden min-w-0 sm:block">
          <p className="truncate text-sm font-semibold text-gray-900">Admin Dashboard</p>
          <p className="text-xs text-gray-400">Services console</p>
        </div>

        <div className="mx-auto w-full max-w-xl flex-1">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full rounded-full border border-gray-200 bg-gray-50 py-2.5 pl-11 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#B91C1C] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20"
            />
          </label>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <NotificationBell />
          <ConsoleProfileMenu />
        </div>
      </div>
    </header>
  );
}
