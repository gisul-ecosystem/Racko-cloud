'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  BookOpen,
  ChevronLeft,
  Clock,
  FileText,
  HelpCircle,
  Layers,
  Monitor,
  Server,
  Terminal,
  UploadCloud,
} from 'lucide-react';
import { hexToRgba } from '@/lib/tenantAccentStyles';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { TENANT_CONSOLE, tenantConsole } from '@/lib/tenantAdminRoutes';

const navSections = [
  {
    title: 'VPS Hosting',
    links: [
      { href: `${tenantConsole.docs}/vps/getting-started`, label: 'Getting Started', icon: BookOpen },
      { href: `${tenantConsole.docs}/vps/managing-vms`, label: 'Managing Your VM', icon: Server },
      { href: `${tenantConsole.docs}/vps/console-access`, label: 'Console Access', icon: Terminal },
      { href: `${tenantConsole.docs}/vps/virtualization`, label: 'Virtualization', icon: Layers },
      { href: `${tenantConsole.docs}/vps/automation`, label: 'VM Automation', icon: Clock },
      { href: `${tenantConsole.docs}/vps/faq`, label: 'FAQ', icon: HelpCircle },
    ],
  },
  {
    title: 'Elastic Server Import',
    links: [
      { href: `${tenantConsole.docs}/esi/getting-started`, label: 'Getting Started', icon: BookOpen },
      { href: `${tenantConsole.docs}/esi/adding-servers`, label: 'Adding Servers', icon: UploadCloud },
      { href: `${tenantConsole.docs}/esi/console-access`, label: 'Browser Console', icon: Monitor },
      { href: `${tenantConsole.docs}/esi/faq`, label: 'FAQ', icon: HelpCircle },
    ],
  },
  {
    title: 'Azure Services',
    links: [
      { href: `${tenantConsole.docs}/azure/getting-started`, label: 'Getting Started', icon: BookOpen },
      { href: `${tenantConsole.docs}/azure/creating-requests`, label: 'Creating Requests', icon: FileText },
      { href: `${tenantConsole.docs}/azure/request-status`, label: 'Request Status', icon: Activity },
      { href: `${tenantConsole.docs}/azure/faq`, label: 'FAQ', icon: HelpCircle },
    ],
  },
  {
    title: 'AWS Services',
    links: [
      { href: `${tenantConsole.docs}/aws/getting-started`, label: 'Getting Started', icon: BookOpen },
      { href: `${tenantConsole.docs}/aws/creating-requests`, label: 'Creating Requests', icon: FileText },
      { href: `${tenantConsole.docs}/aws/request-status`, label: 'Request Status', icon: Activity },
      { href: `${tenantConsole.docs}/aws/faq`, label: 'FAQ', icon: HelpCircle },
    ],
  },
];

function closeIfMobile(onClose: () => void) {
  if (typeof window === 'undefined') return;
  if (window.matchMedia('(max-width: 1023px)').matches) {
    onClose();
  }
}

interface Props {
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
}

export function TenantDocsSidebar({ sidebarOpen, onCloseSidebar }: Props) {
  const pathname = usePathname() ?? '';
  const { accentColor } = useTenantBranding();

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
            <p className="text-sm font-semibold text-gray-900">Documentation</p>
            <p className="mt-0.5 text-xs text-gray-400">Guides &amp; reference</p>
          </div>
          <nav className="flex-1 space-y-4 overflow-y-auto p-3">
            {navSections.map((section) => (
              <div key={section.title}>
                <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  {section.title}
                </p>
                {section.links.map((link) => {
                  const Icon = link.icon;
                  const isActive = pathname === link.href;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => closeIfMobile(onCloseSidebar)}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive ? '' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                      style={
                        isActive
                          ? { backgroundColor: hexToRgba(accentColor, 0.1), color: accentColor }
                          : undefined
                      }
                    >
                      <Icon
                        className={`h-4 w-4 shrink-0 ${isActive ? '' : 'text-gray-400'}`}
                        style={isActive ? { color: accentColor } : undefined}
                      />
                      {link.label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="border-t border-gray-100 p-3">
            <Link
              href={TENANT_CONSOLE}
              onClick={() => closeIfMobile(onCloseSidebar)}
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
