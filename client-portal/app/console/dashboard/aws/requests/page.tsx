'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAwsRoutes } from '@/lib/cloudPortalRoutes';

/** Admin AWS has no standalone list page content elsewhere — send to overview. */
export default function TenantAwsRequestsIndexPage() {
  const router = useRouter();
  const AWS_ROUTES = useAwsRoutes();
  useEffect(() => {
    router.replace(AWS_ROUTES.dashboard);
  }, [router, AWS_ROUTES.dashboard]);
  return null;
}
