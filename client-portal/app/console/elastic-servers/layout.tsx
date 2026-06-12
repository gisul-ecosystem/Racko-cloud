'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '../../../context/AuthContext';
import { ErrorBoundary } from '../../../components/ui/ErrorBoundary';
import { LayoutDashboard, Server, Plus, Upload, ChevronLeft } from 'lucide-react';

interface NavLink {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const navLinks: NavLink[] = [
  {
    href: '/console/elastic-servers/overview',
    label: 'Overview',
    icon: <LayoutDashboard className="w-4 h-4" />,
  },
  {
    href: '/console/elastic-servers',
    label: 'My Servers',
    icon: <Server className="w-4 h-4" />,
  },
  {
    href: '/console/elastic-servers/add',
    label: 'Add Server',
    icon: <Plus className="w-4 h-4" />,
  },
  {
    href: '/console/elastic-servers/bulk',
    label: 'Bulk Import',
    icon: <Upload className="w-4 h-4" />,
  },
];

export default function ElasticServersLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'admin') {
      router.replace(user.role === 'super_admin' ? '/dashboard/super-admin' : '/dashboard/user');
    }
  }, [isLoading, isAuthenticated, user, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#B91C1C] border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated || !user || user.role !== 'admin') return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-30 flex h-full w-60 flex-col border-r border-gray-200 bg-white shadow-sm">
        {/* Brand */}
        <div className="border-b border-gray-100 px-5 py-5">
          <Link
            href="/console/elastic-servers"
            className="inline-flex items-center gap-3 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C] focus-visible:ring-offset-2"
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
            <span className="text-2xl font-bold tracking-tight text-gray-900">Racko</span>
          </Link>
          <p className="mt-3 text-sm font-semibold text-gray-900">Elastic Servers</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {navLinks.map((link) => {
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
                <span className={isActive ? 'text-[#B91C1C]' : 'text-gray-400'}>{link.icon}</span>
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Back to Services + user footer */}
        <div className="border-t border-gray-100 p-3">
          <Link
            href="/console"
            className="mb-3 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
          >
            <ChevronLeft className="h-4 w-4 text-gray-400" />
            Back to Services
          </Link>

          <div className="mb-3 flex items-center gap-3 px-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#B91C1C] text-xs font-bold text-white">
              {user.email[0]?.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-gray-900">{user.email}</p>
              <span className="mt-0.5 inline-block rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                Admin
              </span>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full rounded-lg bg-[#B91C1C] px-3 py-2 text-left text-xs font-medium text-white transition hover:bg-[#DC2626]"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-60 min-h-screen p-8">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
    </div>
  );
}
