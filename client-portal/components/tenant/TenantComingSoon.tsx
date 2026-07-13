'use client';

import { Construction } from 'lucide-react';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { hexToRgba } from '@/lib/tenantAccentStyles';

interface TenantComingSoonProps {
  title?: string;
  description?: string;
}

export function TenantComingSoon({
  title = 'Coming soon',
  description = 'This service is enabled for your workspace. Full management will be available here soon.',
}: TenantComingSoonProps) {
  const { accentColor } = useTenantBranding();

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center justify-center px-6 py-20 text-center">
      <div
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ backgroundColor: hexToRgba(accentColor, 0.1), color: accentColor }}
      >
        <Construction className="h-7 w-7" />
      </div>
      <h1 className="text-xl font-bold text-gray-900">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-gray-500">{description}</p>
    </div>
  );
}
