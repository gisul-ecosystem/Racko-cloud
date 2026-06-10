'use client';

import Link from 'next/link';
import { Server } from 'lucide-react';

const services = [
  {
    id: 'vps',
    name: 'VPS',
    description: 'Create and manage virtual machines, users, and assignments.',
    href: '/dashboard/admin',
    icon: Server,
    available: true,
  },
] as const;

export default function ConsolePage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Services</h1>
        <p className="text-sm text-gray-500 mt-1">
          Select a service to open its dashboard.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {services.map((service) => {
          const Icon = service.icon;
          const cardClass =
            'group relative flex flex-col rounded-xl border p-6 transition shadow-sm ' +
            (service.available
              ? 'bg-white border-gray-200 hover:border-[#B91C1C] hover:shadow-md cursor-pointer'
              : 'bg-gray-50 border-gray-100 opacity-60 cursor-not-allowed');

          const inner = (
            <>
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
                  service.available ? 'bg-red-50 text-[#B91C1C]' : 'bg-gray-100 text-gray-400'
                }`}
              >
                <Icon className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">{service.name}</h2>
              <p className="text-sm text-gray-500 mt-1 flex-1">{service.description}</p>
              {service.available ? (
                <span className="mt-4 text-sm font-medium text-[#B91C1C] group-hover:text-[#DC2626]">
                  Open dashboard →
                </span>
              ) : (
                <span className="mt-4 text-xs font-medium text-gray-400 uppercase tracking-wide">
                  Coming soon
                </span>
              )}
            </>
          );

          if (service.available) {
            return (
              <Link key={service.id} href={service.href} className={cardClass}>
                {inner}
              </Link>
            );
          }

          return (
            <div key={service.id} className={cardClass} aria-disabled>
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
