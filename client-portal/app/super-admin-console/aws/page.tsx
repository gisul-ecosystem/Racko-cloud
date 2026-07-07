'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AWS_ROUTES } from '../../../cloud_automation_aws/constants';

export default function SuperAdminAwsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(AWS_ROUTES.orgAdmin);
  }, [router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-[#B91C1C]" />
    </div>
  );
}
