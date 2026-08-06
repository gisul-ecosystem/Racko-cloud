'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import {
  fetchMyRbacPermissions,
  hasExecutiveHomeRole,
  SUPER_ADMIN_OVERVIEW_PATH,
} from '@/lib/rbacApi';

/**
 * Dashboard index — redirects to role-specific home.
 */
export default function DashboardPage() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !user) {
      router.replace('/login');
      return;
    }

    let cancelled = false;

    async function go() {
      if (user!.role === 'super_admin') {
        router.replace('/super-admin-console');
        return;
      }

      if (user!.role === 'staff') {
        setResolving(true);
        try {
          const rbac = await fetchMyRbacPermissions();
          if (cancelled) return;
          router.replace(
            hasExecutiveHomeRole(rbac) ? SUPER_ADMIN_OVERVIEW_PATH : '/super-admin-console'
          );
        } catch {
          if (!cancelled) router.replace('/super-admin-console');
        }
        return;
      }

      if (user!.role === 'admin') {
        router.replace('/console');
        return;
      }

      router.replace('/dashboard/user');
    }

    void go();
    return () => {
      cancelled = true;
    };
  }, [user, isLoading, isAuthenticated, router]);

  return (
    <div className="flex h-64 items-center justify-center">
      <div
        className={`h-6 w-6 animate-spin rounded-full border-2 border-t-transparent ${
          resolving ? 'border-[#B91C1C]' : 'border-blue-500'
        }`}
      />
    </div>
  );
}
