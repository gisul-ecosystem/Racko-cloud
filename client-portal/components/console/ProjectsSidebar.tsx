'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, FolderKanban, Plus } from 'lucide-react';
import { ServiceNavSidebar } from './ServiceNavSidebar';

export function ProjectsSidebar({
  sidebarOpen,
  onCloseSidebar,
}: {
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
}) {
  const pathname = usePathname() ?? '';

  return (
    <ServiceNavSidebar
      sidebarOpen={sidebarOpen}
      onCloseSidebar={onCloseSidebar}
      title="Projects"
      subtitle="Client cost containers"
      links={[
        {
          href: '/console/projects',
          label: 'All projects',
          icon: <FolderKanban className="h-4 w-4" />,
          exact: true,
        },
        {
          href: '/console/projects/create',
          label: 'Create project',
          icon: <Plus className="h-4 w-4" />,
          isActive: (p) => p.startsWith('/console/projects/create'),
        },
        {
          href: '/console/projects/reports',
          label: 'Reports',
          icon: <BarChart3 className="h-4 w-4" />,
          isActive: () => pathname.startsWith('/console/projects/reports'),
        },
      ]}
      footerHref="/console"
    />
  );
}
