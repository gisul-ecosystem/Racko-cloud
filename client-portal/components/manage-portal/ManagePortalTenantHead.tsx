'use client';

import type { ReactNode } from 'react';
import { TenantBrandingHead } from '@/components/tenant/TenantBrandingHead';
import { shouldUseTenantManagePortalBranding } from '@/lib/gatewayUrl';

/** Tenant favicon/title only on real tenant hosts — never on admin localhost/platform. */
export function ManagePortalTenantHead({ children }: { children?: ReactNode }) {
  if (!shouldUseTenantManagePortalBranding()) {
    return children ?? null;
  }

  return (
    <>
      <TenantBrandingHead />
      {children}
    </>
  );
}
