'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { hexToRgba } from '@/lib/tenantAccentStyles';

export interface ServiceNavLink {
  href: string;
  label: string;
  icon: ReactNode;
  /** Exact match only (e.g. hub “All services”). */
  exact?: boolean;
  /** Custom active check; overrides default prefix matching. */
  isActive?: (pathname: string) => boolean;
}

export interface ServiceNavSection {
  heading?: string;
  links: ServiceNavLink[];
}

export interface ServiceNavSidebarProps {
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
  title: string;
  subtitle?: string;
  links: ServiceNavLink[];
  /** Optional grouped links below the main nav (e.g. super-admin-only tools). */
  extraSections?: ServiceNavSection[];
  /** Accent for active item. Defaults to Racko red. */
  accentColor?: string;
  footerHref?: string;
  footerLabel?: string;
}

const DEFAULT_ACCENT = '#B91C1C';

/** Close overlay sidebar on mobile only — keep open on desktop (matches admin UX). */
function closeIfMobile(onCloseSidebar: () => void) {
  if (typeof window === 'undefined') return;
  if (window.matchMedia('(max-width: 1023px)').matches) {
    onCloseSidebar();
  }
}

function defaultIsActive(pathname: string, link: ServiceNavLink, homeHref?: string): boolean {
  if (link.isActive) return link.isActive(pathname);
  if (link.exact) return pathname === link.href;
  if (pathname === link.href) return true;
  if (homeHref && link.href === homeHref) return false;
  return pathname.startsWith(`${link.href}/`);
}

function renderNavLink(
  link: ServiceNavLink,
  pathname: string,
  homeHref: string | undefined,
  accentColor: string,
  onCloseSidebar: () => void
) {
  const isActive = defaultIsActive(pathname, link, homeHref);
  return (
    <Link
      key={`${link.href}:${link.label}`}
      href={link.href}
      onClick={() => closeIfMobile(onCloseSidebar)}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
        isActive ? '' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
      }`}
      style={
        isActive
          ? {
              backgroundColor: hexToRgba(accentColor, 0.1),
              color: accentColor,
            }
          : undefined
      }
    >
      <span
        className={`shrink-0 ${isActive ? '' : 'text-gray-400'}`}
        style={isActive ? { color: accentColor } : undefined}
      >
        {link.icon}
      </span>
      {link.label}
    </Link>
  );
}

export function ServiceNavSidebar({
  sidebarOpen,
  onCloseSidebar,
  title,
  subtitle,
  links,
  extraSections,
  accentColor = DEFAULT_ACCENT,
  footerHref,
  footerLabel = 'All services',
}: ServiceNavSidebarProps) {
  const pathname = usePathname() ?? '';
  const homeHref = links.find((l) => l.exact)?.href;

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
        className={`fixed left-0 top-0 z-30 flex h-full w-60 flex-col border-r border-gray-200 bg-white shadow-sm transition-all duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:w-0 lg:overflow-hidden'
        }`}
      >
        <div className="flex h-full min-w-[15rem] flex-col">
          <div className="border-b border-gray-100 px-5 py-5">
            <p className="text-sm font-semibold text-gray-900">{title}</p>
            {subtitle ? <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p> : null}
          </div>

          <nav className="scrollbar-white flex-1 space-y-0.5 overflow-y-auto p-3">
            {links.map((link) => renderNavLink(link, pathname, homeHref, accentColor, onCloseSidebar))}
            {extraSections?.map((section, index) => (
              <div key={section.heading ?? `section-${index}`} className="pt-3">
                {section.heading ? (
                  <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    {section.heading}
                  </p>
                ) : (
                  <div className="mb-2 border-t border-gray-100" />
                )}
                {section.links.map((link) =>
                  renderNavLink(link, pathname, homeHref, accentColor, onCloseSidebar)
                )}
              </div>
            ))}
          </nav>

          {footerHref ? (
            <div className="border-t border-gray-100 p-3">
              <Link
                href={footerHref}
                onClick={() => closeIfMobile(onCloseSidebar)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
              >
                <ChevronLeft className="h-4 w-4 text-gray-400" />
                {footerLabel}
              </Link>
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}
