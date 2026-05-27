'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';

import {
  LayoutDashboard,
  Server,
  Plus,
  Briefcase,
  Bell,
  Users,
  MonitorCheck,
  UserCheck,
} from 'lucide-react';

interface NavLink {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles: ('admin' | 'super_admin' | 'user')[];
}

const navLinks: NavLink[] = [
  {
    href: '/dashboard/admin',
    label: 'Overview',
    icon: <LayoutDashboard className="w-4 h-4" />,
    roles: ['admin'],
  },
  {
    href: '/dashboard/admin/vms',
    label: 'My VMs',
    icon: <Server className="w-4 h-4" />,
    roles: ['admin'],
  },
  {
    href: '/dashboard/admin/vms/create',
    label: 'Create VM',
    icon: <Plus className="w-4 h-4" />,
    roles: ['admin'],
  },
  {
    href: '/dashboard/admin/jobs',
    label: 'Jobs',
    icon: <Briefcase className="w-4 h-4" />,
    roles: ['admin'],
  },
  {
    href: '/dashboard/admin/users',
    label: 'Users',
    icon: <Users className="w-4 h-4" />,
    roles: ['admin'],
  },
  {
    href: '/dashboard/admin/assign-vms',
    label: 'Assign VMs',
    icon: <UserCheck className="w-4 h-4" />,
    roles: ['admin'],
  },
  {
    href: '/dashboard/super-admin',
    label: 'Cluster',
    icon: <LayoutDashboard className="w-4 h-4" />,
    roles: ['super_admin'],
  },
  {
    href: '/dashboard/super-admin/vms',
    label: 'All VMs',
    icon: <MonitorCheck className="w-4 h-4" />,
    roles: ['super_admin'],
  },
  {
    href: '/dashboard/super-admin/alerts',
    label: 'Alerts',
    icon: <Bell className="w-4 h-4" />,
    roles: ['super_admin'],
  },
  {
    href: '/dashboard/user',
    label: 'My Dashboard',
    icon: <LayoutDashboard className="w-4 h-4" />,
    roles: ['user'],
  },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !user) {
      router.replace('/login');
      return;
    }
    if (pathname.startsWith('/dashboard/super-admin') && user.role !== 'super_admin') {
      router.replace('/dashboard/admin');
    }
    if (pathname.startsWith('/dashboard/admin') && user.role === 'super_admin') {
      router.replace('/dashboard/super-admin');
    }
    if (pathname.startsWith('/dashboard/admin') && user.role === 'user') {
      router.replace('/dashboard/user');
    }
    if (pathname.startsWith('/dashboard/user') && user.role !== 'user') {
      router.replace(user.role === 'super_admin' ? '/dashboard/super-admin' : '/dashboard/admin');
    }
  }, [isLoading, isAuthenticated, user, pathname, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || !user) return null;

  const visibleLinks = navLinks.filter((l) => l.roles.includes(user.role as 'admin' | 'super_admin' | 'user'));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-60 bg-white border-r border-gray-200 flex flex-col shadow-sm z-30">
        {/* Logo */}
        <div className="p-6 border-b border-gray-100">
          <span className="text-lg font-bold text-gray-900">Racko</span>
          <p className="text-xs text-gray-400 mt-0.5">
            {user.role === 'super_admin' ? 'Super Admin Console' : user.role === 'admin' ? 'Admin Console' : 'User Dashboard'}
          </p>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {visibleLinks.map((link) => {
            // Exact match for static routes; prefix match only for dynamic segments
            const isDynamic = link.href.includes('[');
            const isActive = pathname === link.href ||
              (isDynamic && pathname.startsWith(link.href.split('[')[0]!));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <span className={isActive ? 'text-blue-600' : 'text-gray-400'}>
                  {link.icon}
                </span>
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-3 px-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {user.email[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-900 font-medium truncate">{user.email}</p>
              <span className={`inline-block text-xs px-1.5 py-0.5 rounded font-medium mt-0.5 ${
                user.role === 'super_admin'
                  ? 'bg-purple-100 text-purple-700'
                  : user.role === 'admin'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-green-100 text-green-700'
              }`}>
                {user.role === 'super_admin' ? 'Super Admin' : user.role === 'admin' ? 'Admin' : 'User'}
              </span>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full text-xs text-gray-500 hover:text-gray-900 hover:bg-gray-50 px-3 py-2 rounded-lg transition text-left"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-60 p-8 min-h-screen">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
    </div>
  );
}
