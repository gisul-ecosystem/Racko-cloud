'use client';

import { createContext, useContext } from 'react';
import {
  hasPermission,
  type MyRbacPermissions,
} from '@/lib/rbacApi';

const RbacPermissionsContext = createContext<MyRbacPermissions | null>(null);

export function RbacPermissionsProvider({
  value,
  children,
}: {
  value: MyRbacPermissions | null;
  children: React.ReactNode;
}) {
  return (
    <RbacPermissionsContext.Provider value={value}>{children}</RbacPermissionsContext.Provider>
  );
}

export function useRbacPermissions(): MyRbacPermissions | null {
  return useContext(RbacPermissionsContext);
}

export function useHasPermission(key: string): boolean {
  const perms = useRbacPermissions();
  return hasPermission(perms, key);
}
