'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { useServiceShell } from '../../components/console/useServiceShell';
import { ServiceShellLayout } from '../../components/console/ServiceShellLayout';
import { SuperAdminConsoleSidebar } from '../../components/super-admin-console/SuperAdminConsoleSidebar';
import { SuperAdminConsoleTopBar } from '../../components/super-admin-console/SuperAdminConsoleTopBar';
import {
  fetchMyRbacPermissions,
  hasExecutiveHomeRole,
  hasPermission,
  SUPER_ADMIN_OVERVIEW_PATH,
  type MyRbacPermissions,
} from '@/lib/rbacApi';
import { RbacPermissionsProvider } from '@/context/RbacPermissionsContext';

const SERVICES_WITH_OWN_SHELL = [
  '/super-admin-console/vm-management',
  '/super-admin-console/azure',
  '/super-admin-console/aws',
  '/super-admin-console/machine-manager',
  '/super-admin-console/white-labelling',
];

const STAFF_ROUTE_PERMISSIONS: Array<{ prefix: string; anyOf: string[] }> = [
  { prefix: SUPER_ADMIN_OVERVIEW_PATH, anyOf: ['overview.read'] },
  { prefix: '/super-admin-console/vm-management', anyOf: ['vm_management.manage'] },
  { prefix: '/super-admin-console/machine-manager', anyOf: ['machine_manager.manage'] },
  { prefix: '/super-admin-console/vm-host-leases', anyOf: ['vm_host_leases.manage'] },
  { prefix: '/super-admin-console/azure', anyOf: ['azure.manage'] },
  { prefix: '/super-admin-console/aws', anyOf: ['aws.manage'] },
  { prefix: '/super-admin-console/white-labelling', anyOf: ['white_labelling.manage'] },
  { prefix: '/super-admin-console/admin-users', anyOf: ['admin_users.manage'] },
  { prefix: '/super-admin-console/customers', anyOf: ['admin_users.manage'] },
  { prefix: '/super-admin-console/external-vm-pricing', anyOf: ['pricing.webyne.read', 'pricing.webyne.write'] },
  { prefix: '/super-admin-console/vm-pricing-calculator', anyOf: ['pricing.calculator.read', 'pricing.webyne.read'] },
  { prefix: '/super-admin-console/webyne-vm-requests', anyOf: ['webyne.requests.read'] },
  { prefix: '/super-admin-console/dedicated-server-requests', anyOf: ['dedicated.requests.read'] },
  { prefix: '/super-admin-console/access-control', anyOf: ['rbac.assign', 'rbac.roles.write'] },
];

function isControlPlaneRole(role: string | undefined): boolean {
  return role === 'super_admin' || role === 'staff';
}

function staffHomePath(rbac: MyRbacPermissions): string {
  return hasExecutiveHomeRole(rbac) ? SUPER_ADMIN_OVERVIEW_PATH : '/super-admin-console';
}

function SuperAdminConsoleShell({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, setSidebarOpen, toggleSidebar } = useServiceShell(false);

  return (
    <ServiceShellLayout
      sidebarOpen={sidebarOpen}
      sidebar={
        <SuperAdminConsoleSidebar
          sidebarOpen={sidebarOpen}
          onCloseSidebar={() => setSidebarOpen(false)}
        />
      }
      topBar={<SuperAdminConsoleTopBar onToggleSidebar={toggleSidebar} />}
    >
      {children}
    </ServiceShellLayout>
  );
}

export default function SuperAdminConsoleClientLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [rbac, setRbac] = useState<MyRbacPermissions | null>(null);
  const [rbacLoading, setRbacLoading] = useState(true);

  const usesOwnShell = SERVICES_WITH_OWN_SHELL.some((p) => pathname?.startsWith(p) ?? false);
  const allowed = isAuthenticated && user && isControlPlaneRole(user.role);

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated && user && !isControlPlaneRole(user.role)) {
      router.replace(user.role === 'admin' ? '/console' : '/dashboard/user');
    }
  }, [isLoading, isAuthenticated, user, router]);

  useEffect(() => {
    if (!allowed) {
      setRbac(null);
      setRbacLoading(false);
      return;
    }
    let cancelled = false;
    setRbacLoading(true);
    void fetchMyRbacPermissions()
      .then((data) => {
        if (!cancelled) setRbac(data);
      })
      .catch(() => {
        if (!cancelled) {
          setRbac({
            role: user!.role,
            permissions: [],
            roleSlugs: [],
            isSuperAdmin: user!.role === 'super_admin',
          });
        }
      })
      .finally(() => {
        if (!cancelled) setRbacLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [allowed, user]);

  useEffect(() => {
    if (!allowed || !pathname || !rbac || rbac.isSuperAdmin || user?.role !== 'staff') return;
    const match = STAFF_ROUTE_PERMISSIONS.find((r) => pathname.startsWith(r.prefix));
    if (!match) return;
    const ok = match.anyOf.length > 0 && match.anyOf.some((key) => hasPermission(rbac, key));
    if (!ok) {
      router.replace(staffHomePath(rbac));
    }
  }, [allowed, pathname, rbac, router, user?.role]);

  if (isLoading || (allowed && rbacLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#B91C1C] border-t-transparent" />
      </div>
    );
  }

  if (!allowed) return null;

  const body = usesOwnShell ? (
    <>{children}</>
  ) : (
    <SuperAdminConsoleShell>{children}</SuperAdminConsoleShell>
  );

  return <RbacPermissionsProvider value={rbac}>{body}</RbacPermissionsProvider>;
}
