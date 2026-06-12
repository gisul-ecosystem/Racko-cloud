'use client';

import Image from 'next/image';
import Link from 'next/link';
import { LayoutGrid } from 'lucide-react';
import { useConsoleShell } from './ConsoleContext';

export function ConsoleSidebar() {
  const { sidebarOpen, setSidebarOpen } = useConsoleShell();

  return (
    <>
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 bg-black/20 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-30 flex h-full flex-col border-r border-gray-200 bg-white shadow-sm transition-all duration-300 ${
          sidebarOpen ? 'w-60 translate-x-0' : 'w-0 -translate-x-full lg:w-0 lg:translate-x-0 overflow-hidden'
        }`}
      >
        <div className="flex min-w-[15rem] flex-col h-full">
          <div className="border-b border-gray-100 px-5 py-5">
            <Link
              href="/console"
              className="inline-flex items-center gap-3 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C] focus-visible:ring-offset-2"
            >
              <span className="relative h-9 w-10 shrink-0 overflow-hidden rounded-md">
                <Image
                  src="/images/racko-logo1.png"
                  alt=""
                  width={148}
                  height={40}
                  priority
                  aria-hidden
                  className="absolute left-0 top-0 h-9 w-auto max-w-none"
                />
              </span>
              <span className="text-lg font-bold tracking-tight text-gray-900">Racko</span>
            </Link>
            <p className="mt-3 text-sm font-semibold text-gray-900">Admin Dashboard</p>
          </div>

          <nav className="flex-1 overflow-y-auto p-3">
            <Link
              href="/console"
              className="flex items-center gap-3 rounded-lg bg-red-50 px-3 py-2.5 text-sm font-medium text-[#B91C1C] transition-colors"
            >
              <LayoutGrid className="h-4 w-4 shrink-0 text-[#B91C1C]" />
              Services
            </Link>
          </nav>
        </div>
      </aside>
    </>
  );
}
