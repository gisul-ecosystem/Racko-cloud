'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { tenantVps } from '@/lib/tenantAdminRoutes';

export default function RedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace(tenantVps.assignVms);
  }, [router]);
  return null;
}
