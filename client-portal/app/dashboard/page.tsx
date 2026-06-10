'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';

/**
 * Dashboard index — redirects to role-specific dashboard.
 */
export default function DashboardPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading || !user) return;

    if (user.role === 'super_admin') {
      router.replace('/dashboard/super-admin');
    } else if (user.role === 'admin') {
      router.replace('/console');
    } else {
      router.replace('/dashboard/user');
    }
  }, [user, isLoading, router]);

  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
