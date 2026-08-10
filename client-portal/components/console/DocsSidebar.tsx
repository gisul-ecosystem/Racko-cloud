'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronLeft,
  BookOpen,
  Server,
  HelpCircle,
  Terminal,
  Layers,
  Clock,
  UploadCloud,
  Monitor,
  FileText,
  Activity,
} from 'lucide-react';
import { useAdminServices } from '@/context/AdminServicesContext';
import {
  filterDocsTopics,
  type DocsTopicKey,
} from '@/lib/docsServiceSections';

interface NavSection {
  topic: DocsTopicKey;
  title: string;
  links: { href: string; label: string; icon: React.ReactNode }[];
}

const navSections: NavSection[] = [
  {
    topic: 'vps',
    title: 'VPS Hosting',
    links: [
      { href: '/console/docs/vps/getting-started', label: 'Getting Started', icon: <BookOpen className="h-4 w-4" /> },
      { href: '/console/docs/vps/managing-vms', label: 'Managing Your VM', icon: <Server className="h-4 w-4" /> },
      { href: '/console/docs/vps/console-access', label: 'Console Access', icon: <Terminal className="h-4 w-4" /> },
      { href: '/console/docs/vps/virtualization', label: 'Virtualization', icon: <Layers className="h-4 w-4" /> },
      { href: '/console/docs/vps/automation', label: 'VM Automation', icon: <Clock className="h-4 w-4" /> },
      { href: '/console/docs/vps/faq', label: 'FAQ', icon: <HelpCircle className="h-4 w-4" /> },
    ],
  },
  {
    topic: 'esi',
    title: 'Elastic Server Import',
    links: [
      { href: '/console/docs/esi/getting-started', label: 'Getting Started', icon: <BookOpen className="h-4 w-4" /> },
      { href: '/console/docs/esi/adding-servers', label: 'Adding Servers', icon: <UploadCloud className="h-4 w-4" /> },
      { href: '/console/docs/esi/console-access', label: 'Browser Console', icon: <Monitor className="h-4 w-4" /> },
      { href: '/console/docs/esi/faq', label: 'FAQ', icon: <HelpCircle className="h-4 w-4" /> },
    ],
  },
  {
    topic: 'azure',
    title: 'Azure Services',
    links: [
      { href: '/console/docs/azure/getting-started', label: 'Getting Started', icon: <BookOpen className="h-4 w-4" /> },
      { href: '/console/docs/azure/creating-requests', label: 'Creating Requests', icon: <FileText className="h-4 w-4" /> },
      { href: '/console/docs/azure/request-status', label: 'Request Status', icon: <Activity className="h-4 w-4" /> },
      { href: '/console/docs/azure/faq', label: 'FAQ', icon: <HelpCircle className="h-4 w-4" /> },
    ],
  },
  {
    topic: 'aws',
    title: 'AWS Services',
    links: [
      { href: '/console/docs/aws/getting-started', label: 'Getting Started', icon: <BookOpen className="h-4 w-4" /> },
      { href: '/console/docs/aws/creating-requests', label: 'Creating Requests', icon: <FileText className="h-4 w-4" /> },
      { href: '/console/docs/aws/request-status', label: 'Request Status', icon: <Activity className="h-4 w-4" /> },
      { href: '/console/docs/aws/faq', label: 'FAQ', icon: <HelpCircle className="h-4 w-4" /> },
    ],
  },
];

interface DocsSidebarProps {
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
}

export function DocsSidebar({ sidebarOpen, onCloseSidebar }: DocsSidebarProps) {
  const pathname = usePathname();
  const { hasActiveService, loading } = useAdminServices();
  const visibleSections = loading
    ? []
    : filterDocsTopics(navSections, hasActiveService);

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
            <p className="mt-0.5 text-xs text-gray-400">Guides for your enabled services</p>
          </div>

          <nav className="flex-1 space-y-4 overflow-y-auto p-3">
            {visibleSections.length === 0 && !loading ? (
              <p className="px-3 text-xs text-gray-500">
                No docs yet — enable a product service to see related guides.
              </p>
            ) : null}
            {visibleSections.map((section) => (
              <div key={section.title}>
                <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  {section.title}
                </p>
                <div className="space-y-0.5">
                  {section.links.map((link) => {
                    const isActive = pathname === link.href;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-red-50 text-[#B91C1C]'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                      >
                        <span className={isActive ? 'text-[#B91C1C]' : 'text-gray-400'}>
                          {link.icon}
                        </span>
                        {link.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="border-t border-gray-100 p-3">
            <Link
              href="/console"
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
