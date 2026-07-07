'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import { ServiceShellLayout } from '../../../components/console/ServiceShellLayout';
import { RackoGlobalTopBar } from '../../../components/console/RackoGlobalTopBar';
import { useServiceShell } from '../../../components/console/useServiceShell';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, BookOpen, Monitor } from 'lucide-react';

function SuperAdminMachineManagerSidebar({
  sidebarOpen,
  onCloseSidebar,
}: {
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
}) {
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
            <div className="flex items-center gap-2">
              <Monitor className="h-4 w-4 text-[#B91C1C]" />
              <p className="text-sm font-semibold text-gray-900">Machine Manager</p>
            </div>
            <p className="mt-0.5 text-xs text-gray-400">Software catalog</p>
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
            <Link
              href="/super-admin-console/machine-manager"
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                pathname === '/super-admin-console/machine-manager'
                  ? 'bg-red-50 text-[#B91C1C]'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <BookOpen className={`h-4 w-4 ${pathname === '/super-admin-console/machine-manager' ? 'text-[#B91C1C]' : 'text-gray-400'}`} />
              Software Catalog
            </Link>
          </nav>
          <div className="border-t border-gray-100 p-3">
            <Link
              href="/super-admin-console"
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

export default function SuperAdminMachineManagerLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const { sidebarOpen, setSidebarOpen, toggleSidebar } = useServiceShell(true);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !user) { router.replace('/login'); return; }
    if (user.role !== 'super_admin') {
      router.replace(user.role === 'admin' ? '/console' : '/dashboard/user');
    }
  }, [isLoading, isAuthenticated, user, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#B91C1C] border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated || !user || user.role !== 'super_admin') return null;

  return (
    <ServiceShellLayout
      sidebarOpen={sidebarOpen}
      sidebar={
        <SuperAdminMachineManagerSidebar
          sidebarOpen={sidebarOpen}
          onCloseSidebar={() => setSidebarOpen(false)}
        />
      }
      topBar={
        <RackoGlobalTopBar
          onToggleSidebar={toggleSidebar}
          title="Machine Manager"
          subtitle="Software catalog"
        />
      }
      mainClassName="p-6 lg:p-8"
    >
      {children}
    </ServiceShellLayout>
  );
}
