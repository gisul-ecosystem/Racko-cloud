'use client';

import Link from 'next/link';
import { ArrowLeft, CloudOff } from 'lucide-react';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { hexToRgba, tenantAccentButton } from '@/lib/tenantAccentStyles';

interface TenantCloudProvisioningNoticeProps {
  serviceName: string;
  backHref: string;
  backLabel?: string;
}

/** Shown when a cloud create/catalog flow has no tenant-scoped backend yet. */
export function TenantCloudProvisioningNotice({
  serviceName,
  backHref,
  backLabel = 'Back to overview',
}: TenantCloudProvisioningNoticeProps) {
  const { accentColor } = useTenantBranding();

  return (
    <div className="mx-auto max-w-screen-md py-10">
      <Link
        href={backHref}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Link>

      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm sm:p-12">
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl"
          style={{
            backgroundColor: hexToRgba(accentColor, 0.1),
            color: accentColor,
          }}
        >
          <CloudOff className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">Create {serviceName} request</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
          The request builder UI is available in this workspace, but {serviceName} catalog and
          provisioning APIs are not connected for tenant accounts yet. Use the platform admin
          console to create live requests until tenant cloud APIs are enabled.
        </p>
        <Link
          href={backHref}
          className="mt-6 inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:brightness-95"
          style={tenantAccentButton(accentColor)}
        >
          Back to overview
        </Link>
      </div>
    </div>
  );
}
