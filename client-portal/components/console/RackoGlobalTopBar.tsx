'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Menu, Search } from 'lucide-react';
import { ConsoleProfileMenu } from './ConsoleProfileMenu';
import { NotificationBell as GlobalNotificationBell } from './NotificationBell';
import CloudAutomationNotificationBell from '../shared/NotificationBell';

interface RackoGlobalTopBarProps {
  onToggleSidebar: () => void;
  title: string;
  subtitle?: string;
  showSearch?: boolean;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  searchPlaceholder?: string;
  notificationApiBase?: string;
}

export function RackoGlobalTopBar({
  onToggleSidebar,
  title,
  subtitle,
  showSearch = false,
  searchQuery = '',
  onSearchChange,
  searchPlaceholder = 'Search...',
  notificationApiBase,
}: RackoGlobalTopBarProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
      <div className="flex h-16 items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
        >
          <Menu className="h-5 w-5" />
        </button>

        <Link
          href="/console"
          className="inline-flex shrink-0 items-center gap-2 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C] focus-visible:ring-offset-2"
        >
          <span className="relative h-8 w-9 shrink-0 overflow-hidden rounded-md">
            <Image
              src="/images/racko-logo1.png"
              alt=""
              width={148}
              height={40}
              priority
              aria-hidden
              className="absolute left-0 top-0 h-8 w-auto max-w-none"
            />
          </span>
          <span className="hidden text-base font-bold tracking-tight text-gray-900 sm:inline">
            Racko
          </span>
        </Link>

        <div className="hidden min-w-0 border-l border-gray-200 pl-4 md:block">
          <p className="truncate text-sm font-semibold text-gray-900">{title}</p>
          {subtitle ? <p className="truncate text-xs text-gray-400">{subtitle}</p> : null}
        </div>

        {showSearch ? (
          <div className="mx-auto w-full max-w-xl flex-1">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => onSearchChange?.(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-full border border-gray-200 bg-gray-50 py-2.5 pl-11 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#B91C1C] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20"
              />
            </label>
          </div>
        ) : (
          <div className="flex-1 md:hidden">
            <p className="truncate text-sm font-semibold text-gray-900">{title}</p>
          </div>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          {notificationApiBase ? (
            <CloudAutomationNotificationBell apiBase={notificationApiBase} />
          ) : (
            <GlobalNotificationBell />
          )}
          <ConsoleProfileMenu />
        </div>
      </div>
    </header>
  );
}
