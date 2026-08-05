'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/** Soft redirect — All Projects lives on /console/projects?view=all (same data, no remount). */
export default function AllProjectsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/console/projects?view=all');
  }, [router]);

  return (
    <div className="flex justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
    </div>
  );
}
