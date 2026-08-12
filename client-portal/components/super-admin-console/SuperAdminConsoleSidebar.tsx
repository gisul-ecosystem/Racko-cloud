'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ClipboardList,
  Cloud,
  Database,
  LayoutDashboard,
  LayoutGrid,
  MonitorCheck,
  Palette,
  Server,
  Shield,
  Upload,
  Users,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useRbacPermissions } from '@/context/RbacPermissionsContext';
import { hasPermission, SUPER_ADMIN_OVERVIEW_PATH } from '@/lib/rbacApi';

interface SuperAdminConsoleSidebarProps {
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
}

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  anyOf?: string[];
  section: 'top' | 'services' | 'tools';
};

const navItems: NavItem[] = [
  {
    href: SUPER_ADMIN_OVERVIEW_PATH,
    label: 'Overview',
    icon: LayoutDashboard,
    exact: true,
    anyOf: ['overview.read'],
    section: 'top',
  },
  {
    href: '/super-admin-console',
    label: 'All services',
    icon: LayoutGrid,
    exact: true,
    section: 'top',
  },
  {
    href: '/super-admin-console/elastic-servers',
    label: 'Server Import & Assign',
    icon: Upload,
    exact: false,
    anyOf: ['elastic_servers.superadmin'] as string[],
    section: 'services',
  },
  {
    href: '/super-admin-console/vm-management',
    label: 'VM Management',
    icon: MonitorCheck,
    anyOf: ['vm_management.manage'],
    section: 'services',
  },
  {
    href: '/super-admin-console/vm-inventory',
    label: 'VM Inventory',
    icon: Database,
    anyOf: ['vm_inventory.read'],
    section: 'services',
  },
  {
    href: '/super-admin-console/webyne-vm-requests',
    label: 'Webyne VM Request',
    icon: ClipboardList,
    anyOf: ['webyne.requests.read'],
    section: 'services',
  },
  {
    href: '/super-admin-console/dedicated-server-requests',
    label: 'Dedicated Server',
    icon: ClipboardList,
    anyOf: ['dedicated.requests.read'],
    section: 'services',
  },
  {
    href: '/super-admin-console/azure/org-admin',
    label: 'Azure Services',
    icon: Cloud,
    anyOf: ['azure.manage'],
    section: 'services',
  },
  {
    href: '/super-admin-console/aws/org-admin',
    label: 'AWS Services',
    icon: Server,
    anyOf: ['aws.manage'],
    section: 'services',
  },
  {
    href: '/super-admin-console/white-labelling',
    label: 'White Labelling',
    icon: Palette,
    anyOf: ['white_labelling.manage'],
    section: 'tools',
  },
  {
    href: '/super-admin-console/customers',
    label: 'Customer Directory',
    icon: Users,
    anyOf: ['admin_users.manage'],
    section: 'tools',
  },
  {
    href: '/super-admin-console/access-control',
    label: 'Access control',
    icon: Shield,
    anyOf: ['rbac.assign', 'rbac.roles.write'],
    section: 'tools',
  },
];

function NavLink({
  item,
  pathname,
}: {
  item: NavItem;
  pathname: string | null;
}) {
  const Icon = item.icon;
  const isActive = item.exact ? pathname === item.href : pathname?.startsWith(item.href);
  return (
    <Link
      href={item.href}
      className={`mt-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
        isActive
          ? 'bg-red-50 text-[#B91C1C]'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
      }`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-[#B91C1C]' : 'text-gray-400'}`} />
      {item.label}
    </Link>
  );
}

export function SuperAdminConsoleSidebar({
  sidebarOpen,
  onCloseSidebar,
}: SuperAdminConsoleSidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const rbac = useRbacPermissions();

  const items = navItems.filter((item) => {
    if (
      item.anyOf &&
      user?.role !== 'super_admin' &&
      !item.anyOf.some((key) => hasPermission(rbac, key))
    ) {
      return false;
    }
    return true;
  });

  const top = items.filter((i) => i.section === 'top');
  const services = items.filter((i) => i.section === 'services');
  const tools = items.filter((i) => i.section === 'tools');

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
        className={`fixed left-0 top-0 z-30 flex h-full flex-col border-r border-gray-200 bg-white shadow-sm transition-all duration-300 ${
          sidebarOpen
            ? 'w-60 translate-x-0'
            : 'w-0 -translate-x-full overflow-hidden lg:w-0 lg:translate-x-0'
        }`}
      >
        <div className="flex h-full min-w-[15rem] flex-col">
          <div className="border-b border-gray-100 px-5 py-5">
            <p className="text-sm font-semibold text-gray-900">Super Admin Console</p>
            <p className="mt-0.5 text-xs text-gray-400">Services and platform tools</p>
          </div>
          <nav className="scrollbar-white flex-1 overflow-y-auto p-3">
            {top.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}

            {services.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  Services
                </p>
                {services.map((item) => (
                  <NavLink key={item.href} item={item} pathname={pathname} />
                ))}
              </div>
            )}

            {tools.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  Tools
                </p>
                {tools.map((item) => (
                  <NavLink key={item.href} item={item} pathname={pathname} />
                ))}
              </div>
            )}
          </nav>
        </div>
      </aside>
    </>
  );
}
