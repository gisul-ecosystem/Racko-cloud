'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function LegacyMyVmDetailRedirectPage() {
  const router = useRouter();
  const params = useParams<{ vmId: string }>();

  useEffect(() => {
    if (params.vmId) {
      router.replace(`/console/dashboard/vms/${params.vmId}`);
    }
  }, [router, params.vmId]);

  return null;
}
