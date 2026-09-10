'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

export type ProjectDetailTab = 'overview' | 'support';

interface ProjectDetailNavProps {
  basePath: string;
  transactionsPath: string;
}

export function ProjectDetailNav({ basePath, transactionsPath }: ProjectDetailNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') === 'support' ? 'support' : 'overview';
  const onOverview = pathname === basePath && tab === 'overview';
  const onSupport = pathname === basePath && tab === 'support';
  const onTransactions = pathname.startsWith(`${basePath}/transactions`);

  const tabClass = (active: boolean) =>
    active
      ? 'border-[#B91C1C] text-[#B91C1C]'
      : 'border-transparent text-gray-500 hover:border-gray-200 hover:text-gray-800';

  return (
    <nav className="flex gap-1 border-b border-gray-200">
      <Link
        href={basePath}
        className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${tabClass(onOverview)}`}
      >
        Overview
      </Link>
      <Link
        href={transactionsPath}
        className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${tabClass(onTransactions)}`}
      >
        Transactions
      </Link>
      <Link
        href={`${basePath}?tab=support`}
        className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${tabClass(onSupport)}`}
      >
        Support
      </Link>
    </nav>
  );
}
