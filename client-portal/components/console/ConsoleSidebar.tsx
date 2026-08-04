'use client';

import Link from 'next/link';
import { Boxes, Cloud, FlaskConical, LayoutGrid } from 'lucide-react';
import { AZURE_ROUTES } from '../../cloud_automation/constants';
import { CLOUD_LABS_ROUTES } from '../../cloud_automation_training/constants';
import { useAdminServices } from '@/context/AdminServicesContext';
import { useConsoleShell } from './ConsoleContext';

export function ConsoleSidebar() {
  const { sidebarOpen, setSidebarOpen } = useConsoleShell();
  const { hasActiveService } = useAdminServices();

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
            <p className="text-sm font-semibold text-gray-900">Services console</p>
            <p className="mt-0.5 text-xs text-gray-400">Choose a Racko service</p>
          </div>

          <nav className="flex-1 overflow-y-auto p-3">
            <Link
              href="/console"
              className="flex items-center gap-3 rounded-lg bg-red-50 px-3 py-2.5 text-sm font-medium text-[#B91C1C] transition-colors"
            >
              <LayoutGrid className="h-4 w-4 shrink-0 text-[#B91C1C]" />
              All services
            </Link>
            {hasActiveService('cloud-labs') ? (
              <Link
                href={CLOUD_LABS_ROUTES.hub}
                className="mt-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
              >
                <FlaskConical className="h-4 w-4 shrink-0 text-gray-400" />
                Cloud Labs
              </Link>
            ) : null}
            {hasActiveService('azure') ? (
              <Link
                href={AZURE_ROUTES.dashboard}
                className="mt-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
              >
                <Cloud className="h-4 w-4 shrink-0 text-gray-400" />
                Azure Services
              </Link>
            ) : null}
            {hasActiveService('elastic-servers') ? (
              <Link
                href="/console/elastic-servers"
                className="mt-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
              >
                <Boxes className="h-4 w-4 shrink-0 text-gray-400" />
                Elastic Servers
              </Link>
            ) : null}
          </nav>
        </div>
      </aside>
    </>
  );
}
