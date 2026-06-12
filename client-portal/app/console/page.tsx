'use client';

import Link from 'next/link';
import { Server } from 'lucide-react';
import { RecentResourcesTable } from '../../components/console/RecentResourcesTable';

const services = [
  {
    id: 'vps',
    name: 'VPS Hosting',
    href: '/dashboard/admin',
    icon: Server,
    available: true,
  },
] as const;

export default function ConsolePage() {
  return (
    <div className="mx-auto max-w-screen-xl space-y-8">
      <section>
        <h1 className="mb-5 text-2xl font-bold text-gray-900">Racko.ai services</h1>

        <div className="flex flex-wrap gap-4">
          {services.map((service) => {
            const Icon = service.icon;

            return (
              <Link
                key={service.id}
                href={service.href}
                className="group flex w-36 flex-col items-center rounded-xl border border-gray-200 bg-white px-4 py-6 text-center shadow-sm transition hover:border-[#B91C1C] hover:shadow-md"
              >
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-red-50 text-[#B91C1C] transition group-hover:bg-[#B91C1C] group-hover:text-white">
                  <Icon className="h-7 w-7" />
                </div>
                <span className="text-sm font-medium text-gray-900">{service.name}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <RecentResourcesTable />
    </div>
  );
}
