'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { tenantVps } from '@/lib/tenantAdminRoutes';

export default function RedirectPage() {
  const router = useRouter();
  const params = useParams();
  const vmId = params.vmId as string;
  useEffect(() => {
    if (vmId) router.replace(tenantVps.vm(vmId));
  }, [router, vmId]);
  return null;
}
