'use client';

import { Clock, FolderOpen, Hash, Mail, ShieldCheck } from 'lucide-react';
import type { ManagePortalSession } from '../../types/managePortal';

interface ManageUsersSummaryProps {
  session: ManagePortalSession;
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
        {icon}
        {label}
      </div>
      <p className="truncate text-sm font-semibold text-gray-900" title={value}>
        {value}
      </p>
    </div>
  );
}

export function ManageUsersSummary({ session }: ManageUsersSummaryProps) {
  const expiresLabel = new Date(session.expiresAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const sessionActive = new Date(session.expiresAt).getTime() > Date.now();
  const roleLabel = session.role === 'user' ? 'Provisioned User' : 'Admin';

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <SummaryCard
        label="Signed in as"
        value={roleLabel}
        icon={<ShieldCheck className="h-3.5 w-3.5" />}
      />
      <SummaryCard
        label="Request ID"
        value={`#${session.requestId}`}
        icon={<Hash className="h-3.5 w-3.5" />}
      />
      <SummaryCard
        label="Resource Group"
        value={session.resourceGroup || 'Not assigned'}
        icon={<FolderOpen className="h-3.5 w-3.5" />}
      />
      <SummaryCard
        label="Customer Email"
        value={session.customerEmail}
        icon={<Mail className="h-3.5 w-3.5" />}
      />
      <SummaryCard
        label="Portal Session"
        value={sessionActive ? `Active · until ${expiresLabel}` : 'Expired'}
        icon={
          sessionActive ? (
            <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
          ) : (
            <Clock className="h-3.5 w-3.5 text-amber-600" />
          )
        }
      />
    </div>
  );
}
