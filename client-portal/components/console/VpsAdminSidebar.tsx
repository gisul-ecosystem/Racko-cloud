'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Briefcase,
  ChevronLeft,
  Clock,
  Copy,
  LayoutDashboard,
  Layers,
  Plus,
  Server,
  Shield,
  UserCheck,
  Users,
} from 'lucide-react';

interface NavLink {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const navLinks: NavLink[] = [
  {
    href: '/dashboard/admin',
    label: 'Overview',
    icon: <LayoutDashboard className="h-4 w-4" />,
  },
  {
    href: '/dashboard/admin/vms',
    label: 'My VMs',
    icon: <Server className="h-4 w-4" />,
  },
  {
    href: '/dashboard/admin/vms/create',
    label: 'Create VM',
    icon: <Plus className="h-4 w-4" />,
  },
  {
    href: '/dashboard/admin/clone-vms',
    label: 'Clone VMs',
    icon: <Copy className="h-4 w-4" />,
  },
  {
    href: '/dashboard/admin/jobs',
    label: 'Jobs',
    icon: <Briefcase className="h-4 w-4" />,
  },
  {
    href: '/dashboard/admin/automation',
    label: 'Automation',
    icon: <Clock className="h-4 w-4" />,
  },
  {
    href: '/dashboard/admin/templates',
    label: 'My Templates',
    icon: <Layers className="h-4 w-4" />,
  },
  {
    href: '/dashboard/admin/users',
    label: 'Users',
    icon: <Users className="h-4 w-4" />,
  },
  {
    href: '/dashboard/admin/assign-vms',
    label: 'Assign VMs',
    icon: <UserCheck className="h-4 w-4" />,
  },
  {
    href: '/dashboard/admin/assign-vms/bulk',
    label: 'Bulk Assign',
    icon: <Users className="h-4 w-4" />,
  },
  {
    href: '/dashboard/admin/vms/restricted',
    label: 'Restricted VMs',
    icon: <Shield className="h-4 w-4" />,
  },
];

interface VpsAdminSidebarProps {
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
}

export function VpsAdminSidebar({ sidebarOpen, onCloseSidebar }: VpsAdminSidebarProps) {
  const pathname = usePathname();

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
            <p className="text-sm font-semibold text-gray-900">VPS Hosting</p>
            <p className="mt-0.5 text-xs text-gray-400">Virtual machines & jobs</p>
          </div>

          <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
            {navLinks.map((link) => {
              const isActive =
                pathname === link.href ||
                (link.href !== '/dashboard/admin' && pathname.startsWith(`${link.href}/`));

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
                  <span className={isActive ? 'text-[#B91C1C]' : 'text-gray-400'}>{link.icon}</span>
                  {link.label}
                </Link>
              );
            })}
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
