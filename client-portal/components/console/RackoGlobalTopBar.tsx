'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Menu, Search, X } from 'lucide-react';
import { useRef, useEffect, type ReactNode } from 'react';
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
  /** Dropdown rendered below the search input — supplied by the caller */
  searchDropdown?: ReactNode;
  isSearchOpen?: boolean;
  onSearchOpen?: (open: boolean) => void;
}

export function RackoGlobalTopBar({
  onToggleSidebar,
  title,
  subtitle,
  showSearch = false,
  searchQuery = '',
  onSearchChange,
  searchPlaceholder = 'Search services and resources...',
  notificationApiBase,
  searchDropdown,
  isSearchOpen = false,
  onSearchOpen,
}: RackoGlobalTopBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isSearchOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onSearchOpen?.(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isSearchOpen, onSearchOpen]);

  // '/' shortcut
  useEffect(() => {
    if (!showSearch) return;
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        onSearchOpen?.(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [showSearch, onSearchOpen]);

  return (
    <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
      <div className="flex h-16 items-center gap-3 px-4 sm:gap-4 sm:px-6">
        {/* Sidebar toggle */}
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Logo */}
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

        {/* Title */}
        <div className="hidden min-w-0 border-l border-gray-200 pl-4 md:block">
          <p className="truncate text-sm font-semibold text-gray-900">{title}</p>
          {subtitle ? <p className="truncate text-xs text-gray-400">{subtitle}</p> : null}
        </div>

        {/* Search */}
        {showSearch ? (
          <div ref={containerRef} className="relative mx-auto w-full max-w-xl flex-1">
            <div
              className={`flex items-center gap-2 rounded-lg border bg-gray-50 px-3 py-2 transition ${
                isSearchOpen
                  ? 'border-[#B91C1C] bg-white ring-2 ring-[#B91C1C]/20'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Search className="h-4 w-4 shrink-0 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  onSearchChange?.(e.target.value);
                  if (!isSearchOpen) onSearchOpen?.(true);
                }}
                onFocus={() => onSearchOpen?.(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    onSearchOpen?.(false);
                    inputRef.current?.blur();
                  }
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const first = containerRef.current?.querySelector<HTMLElement>('[data-result]');
                    first?.focus();
                  }
                }}
                placeholder={searchPlaceholder}
                autoComplete="off"
                spellCheck={false}
                aria-label="Search services and resources"
                aria-expanded={isSearchOpen}
                aria-haspopup="listbox"
                className="flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none min-w-0"
              />
              {!isSearchOpen && !searchQuery && (
                <kbd className="hidden shrink-0 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-400 sm:inline-flex">
                  /
                </kbd>
              )}
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => { onSearchChange?.(''); inputRef.current?.focus(); }}
                  aria-label="Clear search"
                  className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Dropdown — injected by caller */}
            {isSearchOpen && searchDropdown}
          </div>
        ) : (
          <div className="flex-1 md:hidden">
            <p className="truncate text-sm font-semibold text-gray-900">{title}</p>
          </div>
        )}

        {/* Right */}
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
