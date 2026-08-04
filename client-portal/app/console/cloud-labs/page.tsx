'use client';

import Link from 'next/link';
import { ArrowRight, Cloud, FlaskConical } from 'lucide-react';
import {
  AZURE_LABS_SERVICE,
  CLOUD_LABS_ROUTES,
  CLOUD_LABS_SERVICE,
} from '../../../cloud_automation_training/constants';

const LABS = [
  {
    id: AZURE_LABS_SERVICE.id,
    name: AZURE_LABS_SERVICE.name,
    description: AZURE_LABS_SERVICE.description,
    href: CLOUD_LABS_ROUTES.azureDashboard,
    icon: Cloud,
    available: true,
  },
];

export default function CloudLabsHubPage() {
  return (
    <div className="mx-auto max-w-screen-lg space-y-8">
      <section>
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-[#B91C1C]">
            <FlaskConical className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{CLOUD_LABS_SERVICE.name}</h1>
            <p className="text-sm text-gray-500">{CLOUD_LABS_SERVICE.description}</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">
          Available labs
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {LABS.map((lab) => {
            const Icon = lab.icon;
            return (
              <Link
                key={lab.id}
                href={lab.href}
                className="group flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-[#B91C1C] hover:shadow-md"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#B91C1C] transition group-hover:bg-[#B91C1C] group-hover:text-white">
                  <Icon className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-base font-semibold text-gray-900">{lab.name}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-gray-300 transition group-hover:text-[#B91C1C]" />
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-gray-500">{lab.description}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
