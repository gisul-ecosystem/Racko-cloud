'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AZURE_ROUTES } from '../../../cloud_automation/constants';

export default function SuperAdminAzureRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(AZURE_ROUTES.orgAdmin);
  }, [router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-[#B91C1C]" />
    </div>
  );
}
