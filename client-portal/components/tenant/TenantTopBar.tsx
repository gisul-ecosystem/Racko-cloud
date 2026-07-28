'use client';

import Link from 'next/link';
import { Menu, LogOut, User } from 'lucide-react';
import { useTenantAuth } from '@/context/TenantAuthContext';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { TenantNotificationBell } from './TenantNotificationBell';
import { hexToRgba } from '@/lib/tenantAccentStyles';
import { TENANT_CONSOLE, tenantVps } from '@/lib/tenantAdminRoutes';

interface TenantTopBarProps {
  onToggleSidebar: () => void;
  title: string;
  subtitle?: string;
}

export function TenantTopBar({ onToggleSidebar, title, subtitle }: TenantTopBarProps) {
  const { tenantUser, logout } = useTenantAuth();
  const { logoSrc, portalName, accentColor } = useTenantBranding();
  const isAdmin = tenantUser?.role === 'tenant_admin';
  const homeHref = isAdmin ? TENANT_CONSOLE : tenantVps.vms;

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
          href={homeHref}
          className="inline-flex shrink-0 items-center gap-2 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          style={{ ['--tw-ring-color' as string]: accentColor }}
        >
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoSrc}
              alt={portalName || 'Portal'}
              className="h-8 max-w-[120px] object-contain"
            />
          ) : (
            <span
              className="flex h-8 w-8 items-center justify-center rounded-md text-sm font-bold text-white"
              style={{ backgroundColor: accentColor }}
            >
              {(portalName || 'T').charAt(0).toUpperCase()}
            </span>
          )}
        </Link>

        <div className="hidden min-w-0 border-l border-gray-200 pl-4 md:block">
          <p className="truncate text-sm font-semibold text-gray-900">{title}</p>
          {subtitle ? <p className="truncate text-xs text-gray-400">{subtitle}</p> : null}
        </div>

        <div className="flex-1 md:hidden">
          <p className="truncate text-sm font-semibold text-gray-900">{title}</p>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <TenantNotificationBell />
          <div className="hidden text-right sm:block">
            <p className="max-w-[160px] truncate text-xs font-medium text-gray-700">
              {tenantUser?.email}
            </p>
          </div>
          {isAdmin ? (
            <Link
              href="/console/dashboard/profile"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50"
              aria-label="Profile"
            >
              <User className="h-4 w-4" />
            </Link>
          ) : null}
          <button
            type="button"
            onClick={logout}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm text-gray-600 transition hover:bg-gray-50"
            style={{ borderColor: hexToRgba(accentColor, 0.25) }}
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}
