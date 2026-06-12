'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { VpsAdminShell } from '../../components/console/VpsAdminShell';

import {
  LayoutDashboard,
  Server,
  Plus,
  Briefcase,
  Bell,
  Users,
  MonitorCheck,
  UserCheck,
  Package,
  Layers,
  Clock,
} from 'lucide-react';

interface NavLink {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles: ('admin' | 'super_admin' | 'user')[];
}

const navLinks: NavLink[] = [
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
    href: '/dashboard/super-admin/software',
    label: 'Software',
    icon: <Package className="w-4 h-4" />,
    roles: ['super_admin'],
  },
  {
    href: '/dashboard/super-admin/templates',
    label: 'Templates',
    icon: <Layers className="w-4 h-4" />,
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

  if (!isAuthenticated || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (user.role === 'admin') {
    return <VpsAdminShell>{children}</VpsAdminShell>;
  }

  const visibleLinks = navLinks.filter((l) => l.roles.includes(user.role as 'super_admin' | 'user'));

  const dashboardHome =
    user.role === 'super_admin' ? '/dashboard/super-admin' : '/dashboard/user';

  return (
    <div className="min-h-screen bg-gray-50">
      <aside className="fixed left-0 top-0 h-full w-60 bg-white border-r border-gray-200 flex flex-col shadow-sm z-30">
        <div className="px-5 py-5 border-b border-gray-100">
          <Link
            href={dashboardHome}
            className="inline-flex items-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C] focus-visible:ring-offset-2 rounded-md"
          >
            <span className="relative h-11 w-12 shrink-0 overflow-hidden rounded-md">
              <Image
                src="/images/racko-logo1.png"
                alt=""
                width={148}
                height={40}
                priority
                aria-hidden
                className="absolute left-0 top-0 h-11 w-auto max-w-none"
              />
            </span>
            <span className="text-2xl font-bold text-gray-900 tracking-tight">Racko</span>
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {visibleLinks.map((link) => {
            const isDynamic = link.href.includes('[');
            const isActive =
              pathname === link.href ||
              (isDynamic && pathname.startsWith(link.href.split('[')[0]!));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
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
        </nav>
      </aside>

      <main className="ml-60 p-8 min-h-screen">
        {user.role === 'user' && (
          <div className="mb-6 flex justify-end">
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
            >
              Sign out
            </button>
          </div>
        )}
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
    </div>
  );
}
