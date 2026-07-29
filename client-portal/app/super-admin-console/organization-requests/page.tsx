'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy route — organization requests now live in Customer Directory. */
export default function OrganizationRequestsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/super-admin-console/customers?filter=organization');
  }, [router]);
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-gray-500">
      Redirecting to Customer Directory…
    </div>
  );
}
