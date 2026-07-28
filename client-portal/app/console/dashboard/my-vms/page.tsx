'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LegacyMyVmsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/console/dashboard/vms');
  }, [router]);

  return null;
}
