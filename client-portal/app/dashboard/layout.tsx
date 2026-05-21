'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated } = useAuth();
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
  }, [isLoading, isAuthenticated, user, pathname, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || !user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-60 bg-white border-r border-gray-200 flex flex-col shadow-sm">
        <div className="p-6 border-b border-gray-100">
          <span className="text-lg font-bold text-gray-900">CloudPlatform</span>
          <p className="text-xs text-gray-400 mt-0.5">Admin Console</p>
        </div>
        <nav className="flex-1 p-4">
        </nav>
        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {user.email[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-900 font-medium truncate">{user.email}</p>
              <RoleBadge role={user.role} />
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-60 p-8">{children}</main>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const isSuper = role === 'super_admin';
  return (
    <span
      className={`inline-block text-xs px-1.5 py-0.5 rounded font-medium mt-0.5 ${
        isSuper ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
      }`}
    >
      {isSuper ? 'Super Admin' : 'Admin'}
    </span>
  );
}
