'use client';

import Link from 'next/link';
import { HardDrive, Server } from 'lucide-react';

export default function DedicatedServerOverviewPage() {
  return (
    <div className="max-w-screen-xl">
      <h1 className="text-2xl font-bold text-gray-900">Dedicated Server</h1>
      <p className="mt-1 text-sm text-gray-500">
        Request dedicated hardware from Racko. Super-admin fulfills and attaches your machine.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          href="/console/dedicated-server/request"
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-[#B91C1C]"
        >
          <HardDrive className="mb-3 h-8 w-8 text-[#B91C1C]" />
          <h2 className="font-semibold text-gray-900">Request Server</h2>
          <p className="mt-1 text-sm text-gray-500">
            Browse plans and submit a purchase request (wallet charged).
          </p>
        </Link>
        <Link
          href="/console/dedicated-server/my-servers"
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-[#B91C1C]"
        >
          <Server className="mb-3 h-8 w-8 text-[#B91C1C]" />
          <h2 className="font-semibold text-gray-900">My Servers</h2>
          <p className="mt-1 text-sm text-gray-500">
            Track requests and open console when your server is attached.
          </p>
        </Link>
      </div>
    </div>
  );
}
