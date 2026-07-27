'use client';

import { useEffect, useMemo, useRef, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Cloud, Globe, Server, ArrowRight, Monitor } from 'lucide-react';
import { useConsoleShell } from './ConsoleContext';
import { useAuth } from '../../context/AuthContext';
import { useMyVMs } from '../../hooks/useVMs';
import { useExternalVMs } from '../../hooks/useExternalVMs';
import { VMStatusBadge } from '../dashboard/VMStatusBadge';
import { AZURE_ROUTES, AZURE_SERVICE } from '../../cloud_automation/constants';
import { AWS_ROUTES, AWS_SERVICE } from '../../cloud_automation_aws/constants';

// ─── Static service list (mirrors console/page.tsx) ─────────────────────────

const ALL_SERVICES = [
  {
    id: 'vps',
    name: 'VPS Hosting',
    href: '/dashboard/admin',
    Icon: Server,
    description: 'Provision and manage Racko cloud virtual machines',
  },
  {
    id: 'elastic',
    name: 'Elastic Server Import',
    href: '/console/elastic-servers',
    Icon: Globe,
    description: 'Connect to external servers from any provider via secure browser console',
  },
  {
    id: AZURE_SERVICE.id,
    name: AZURE_SERVICE.name,
    href: AZURE_ROUTES.dashboard,
    Icon: Cloud,
    description: AZURE_SERVICE.description,
  },
  {
    id: AWS_SERVICE.id,
    name: AWS_SERVICE.name,
    href: AWS_ROUTES.dashboard,
    Icon: Server,
    description: AWS_SERVICE.description,
  },
  {
    id: 'docs',
    name: 'Documentation',
    href: '/console/docs',
    Icon: BookOpen,
    description: 'Guides and reference for VPS Hosting and Elastic Server Import',
  },
];

// ─── Highlight matched text ──────────────────────────────────────────────────

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-[#B91C1C] font-semibold">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

// ─── Main dropdown ───────────────────────────────────────────────────────────

export function ConsoleSearchDropdown() {
  const { debouncedQuery, setSearchQuery, setSearchOpen } = useConsoleShell();
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const activeIndexRef = useRef(-1);

  const { vms } = useMyVMs(isAuthenticated);
  const { vms: externalVms } = useExternalVMs(isAuthenticated);

  const query = debouncedQuery.trim().toLowerCase();

  // ── Filtered services ──────────────────────────────────────────────────────
  const filteredServices = useMemo(() => {
    if (!query) return ALL_SERVICES;
    return ALL_SERVICES.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        s.description.toLowerCase().includes(query)
    );
  }, [query]);

  // ── Filtered resources ─────────────────────────────────────────────────────
  const filteredResources = useMemo(() => {
    const vpsItems = vms.map((vm) => ({
      id: `vps-${vm._id}`,
      name: vm.name,
      detail: vm.ipAddress || vm.templateName || '',
      serviceLabel: 'VPS Hosting',
      href: `/dashboard/admin/vms/${vm._id}`,
      vpsStatus: vm.status,
      lastActivityAt: vm.updatedAt,
    }));

    const elasticItems = externalVms.map((vm) => ({
      id: `elastic-${vm._id}`,
      name: vm.name,
      detail: vm.ipAddress,
      serviceLabel: 'Elastic Server',
      href: `/console/elastic-servers/${vm._id}/console`,
      vpsStatus: undefined as typeof vms[0]['status'] | undefined,
      lastActivityAt: vm.updatedAt || vm.createdAt,
    }));

    const all = [...vpsItems, ...elasticItems].sort(
      (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
    );

    if (!query) return all.slice(0, 5);
    return all
      .filter(
        (r) =>
          r.name.toLowerCase().includes(query) ||
          r.serviceLabel.toLowerCase().includes(query) ||
          r.detail.toLowerCase().includes(query)
      )
      .slice(0, 8);
  }, [vms, externalVms, query]);

  // ── Navigate and close ─────────────────────────────────────────────────────
  function navigate(href: string) {
    setSearchQuery('');
    setSearchOpen(false);
    router.push(href);
  }

  // ── Keyboard navigation ────────────────────────────────────────────────────
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const items = panelRef.current?.querySelectorAll<HTMLElement>('[data-result]');
    if (!items || items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndexRef.current = Math.min(activeIndexRef.current + 1, items.length - 1);
      items[activeIndexRef.current]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndexRef.current = Math.max(activeIndexRef.current - 1, 0);
      items[activeIndexRef.current]?.focus();
    } else if (e.key === 'Escape') {
      setSearchOpen(false);
    }
  }

  const hasResults = filteredServices.length > 0 || filteredResources.length > 0;

  return (
    <div
      ref={panelRef}
      role="listbox"
      aria-label="Search results"
      onKeyDown={handleKeyDown}
      className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[520px] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-2xl"
    >
      {/* ── Services section ─────────────────────────────────────────────── */}
      {filteredServices.length > 0 && (
        <div>
          <div className="sticky top-0 bg-gray-50 px-4 py-2 border-b border-gray-100">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              {query ? 'Services' : 'All Services'}
            </p>
          </div>
          <ul>
            {filteredServices.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  data-result
                  onClick={() => navigate(s.href)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-gray-50 focus:bg-gray-50 focus:outline-none group"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-[#B91C1C] group-hover:bg-[#B91C1C] group-hover:text-white transition">
                    <s.Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-900">
                      <Highlight text={s.name} query={query} />
                    </span>
                    <span className="block truncate text-xs text-gray-400">
                      <Highlight text={s.description} query={query} />
                    </span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-300 group-hover:text-[#B91C1C] transition" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Recent Resources section ─────────────────────────────────────── */}
      {filteredResources.length > 0 && (
        <div className={filteredServices.length > 0 ? 'border-t border-gray-100' : ''}>
          <div className="sticky top-0 bg-gray-50 px-4 py-2 border-b border-gray-100">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              {query ? 'Resources' : 'Recent Resources'}
            </p>
          </div>
          <ul>
            {filteredResources.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  data-result
                  onClick={() => navigate(r.href)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-gray-50 focus:bg-gray-50 focus:outline-none group"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                    <Server className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-900">
                      <Highlight text={r.name} query={query} />
                    </span>
                    <span className="block truncate text-xs text-gray-400">
                      {r.serviceLabel}
                      {r.detail ? ` · ${r.detail}` : ''}
                    </span>
                  </span>
                  {r.vpsStatus && (
                    <VMStatusBadge status={r.vpsStatus} />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── No results ───────────────────────────────────────────────────── */}
      {query && !hasResults && (
        <div className="px-4 py-10 text-center">
          <p className="text-sm text-gray-500">No results for <span className="font-medium text-gray-900">"{debouncedQuery}"</span></p>
          <p className="mt-1 text-xs text-gray-400">Try a different search term</p>
        </div>
      )}
    </div>
  );
}
