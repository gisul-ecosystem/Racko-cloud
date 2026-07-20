'use client';

import Link from 'next/link';
import { Cloud, HardDrive } from 'lucide-react';

const providers = [
  {
    id: 'webyne',
    name: 'Webyne Templates',
    href: '/super-admin-console/external-vm-pricing/webyne',
    icon: Cloud,
    description: 'Manage VM templates and pricing shown on Create VM',
  },
  {
    id: 'dedicated-server',
    name: 'Dedicated Server Plans',
    href: '/super-admin-console/external-vm-pricing/dedicated-server',
    icon: HardDrive,
    description: 'Bare-metal catalog, setup fees, and sell multiplier',
  },
] as const;

export default function ExternalVmPricingHubPage() {
  return (
    <div className="mx-auto max-w-screen-xl space-y-8">
      <section>
        <h1 className="mb-1 text-2xl font-bold text-gray-900">External VM Pricing and Configuration</h1>
        <p className="mb-5 text-sm text-gray-500">
          Override catalog plan prices from the external provider
        </p>

        <div className="flex flex-wrap justify-center gap-6">
          {providers.map((provider) => {
            const Icon = provider.icon;
            return (
              <Link
                key={provider.id}
                href={provider.href}
                className="group flex h-[200px] w-[200px] flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-5 text-center shadow-sm transition hover:border-[#B91C1C] hover:shadow-md"
              >
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-red-50 text-[#B91C1C] transition group-hover:bg-[#B91C1C] group-hover:text-white">
                  <Icon className="h-7 w-7" />
                </div>
                <span className="text-sm font-medium text-gray-900">{provider.name}</span>
                <span className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-gray-500">
                  {provider.description}
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
