'use client';

import { Cloud, LogOut, RefreshCw } from 'lucide-react';
import { useManagePortalBrand } from '@/components/manage-portal/ManagePortalAuthFrame';

export default function PortalHeader({ onRefresh, onSignOut, refreshing, title = 'Manage Provisioned Users' }) {
  const { accent, accentSoft, portalName, logoSrc } = useManagePortalBrand();

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-screen-xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoSrc}
              alt={`${portalName} logo`}
              className="h-10 w-auto max-w-[140px] object-contain object-left"
            />
          ) : (
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ backgroundColor: accentSoft, color: accent }}
            >
              <Cloud className="h-5 w-5" />
            </div>
          )}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{portalName}</p>
            <h1 className="text-lg font-bold text-gray-900">{title}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </div>
    </header>
  );
}
