'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'admin') {
      router.replace(
        user.role === 'super_admin' ? '/dashboard/super-admin' : '/dashboard/user'
      );
    }
  }, [isLoading, isAuthenticated, user, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#B91C1C] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || !user || user.role !== 'admin') return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <Link
            href="/console"
            className="inline-flex items-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C] focus-visible:ring-offset-2 rounded-md"
          >
            <span className="relative h-9 w-10 shrink-0 overflow-hidden rounded-md">
              <Image
                src="/images/racko-logo1.png"
                alt=""
                width={148}
                height={40}
                priority
                aria-hidden
                className="absolute left-0 top-0 h-9 w-auto max-w-none"
              />
            </span>
            <span className="text-xl font-bold text-gray-900 tracking-tight">Racko</span>
            <span className="text-sm text-gray-400 font-medium hidden sm:inline">Console</span>
          </Link>

          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:inline truncate max-w-[200px]">
              {user.email}
            </span>
            <button
              type="button"
              onClick={() => void logout()}
              className="text-sm font-medium text-white bg-[#B91C1C] hover:bg-[#DC2626] px-4 py-2 rounded-lg transition"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
    </div>
  );
}
