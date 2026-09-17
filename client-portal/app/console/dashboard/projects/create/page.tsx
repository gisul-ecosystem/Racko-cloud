'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/** Create flow lives in the projects dashboard modal. */
export default function TenantCreateProjectRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/console/dashboard/projects?create=1');
  }, [router]);

  return (
    <div className="flex justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
    </div>
  );
}
