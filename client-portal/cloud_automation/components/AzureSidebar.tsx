'use client';

import Link from 'next/link';
import { ChevronLeft, Cloud, LayoutGrid, Plus } from 'lucide-react';
import { useAzureShell } from '../hooks/useAzureShell';
import { useAzureRoutes } from '../../lib/cloudPortalRoutes';

export function AzureSidebar() {
  const { sidebarOpen, setSidebarOpen } = useAzureShell();
  const AZURE_ROUTES = useAzureRoutes();

  return (
    <>
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-20 bg-black/20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-30 flex h-full flex-col border-r border-gray-200 bg-white shadow-sm transition-all duration-300 ${
          sidebarOpen ? 'w-60 translate-x-0' : 'w-0 -translate-x-full overflow-hidden lg:w-0 lg:translate-x-0'
        }`}
      >
        <div className="flex h-full min-w-[15rem] flex-col">
          <div className="border-b border-gray-100 px-5 py-5">
            <p className="text-sm font-semibold text-gray-900">Azure Services</p>
            <p className="mt-0.5 text-xs text-gray-400">Cloud automation</p>
          </div>

          <nav className="flex-1 overflow-y-auto p-3">
            <Link
              href={AZURE_ROUTES.dashboard}
              className="flex items-center gap-3 rounded-lg bg-red-50 px-3 py-2.5 text-sm font-medium text-[#B91C1C] transition-colors"
            >
              <LayoutGrid className="h-4 w-4 shrink-0 text-[#B91C1C]" />
              Overview
            </Link>
            <Link
              href={AZURE_ROUTES.createRequest}
              className="mt-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
            >
              <Plus className="h-4 w-4 shrink-0 text-gray-400" />
              Create request
            </Link>
          </nav>

          <div className="border-t border-gray-100 p-3">
            <Link
              href={AZURE_ROUTES.consoleHub}
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
