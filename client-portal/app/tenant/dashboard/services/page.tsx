'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TENANT_CONSOLE } from '@/lib/tenantAdminRoutes';

export default function RedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace(TENANT_CONSOLE);
  }, [router]);
  return null;
}
