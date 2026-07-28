'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function RedirectPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  useEffect(() => {
    if (id) router.replace(`/console/dashboard/admin/jobs/${id}`);
  }, [router, id]);
  return null;
}
