'use client';

import { Clock, FolderOpen, Hash, Mail, ShieldCheck } from 'lucide-react';

function SummaryCard({ label, value, icon }) {
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

export default function InfoCards({ signedInAs, requestId, awsAccountId, customerEmail, expiresAt, startsAt }) {
  const expiresLabel = expiresAt
    ? new Date(expiresAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  const startsLabel = startsAt
    ? new Date(startsAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  const serviceStarted = !startsAt || new Date(startsAt).getTime() <= Date.now();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <SummaryCard
        label="Signed in as"
        value={signedInAs}
        icon={<ShieldCheck className="h-3.5 w-3.5" />}
      />
      <SummaryCard
        label="Request ID"
        value={`#${String(requestId).slice(-6)}`}
        icon={<Hash className="h-3.5 w-3.5" />}
      />
      <SummaryCard
        label="AWS Account"
        value={awsAccountId || 'Loading...'}
        icon={<FolderOpen className="h-3.5 w-3.5" />}
      />
      <SummaryCard
        label="Customer Email"
        value={customerEmail || '—'}
        icon={<Mail className="h-3.5 w-3.5" />}
      />
      <SummaryCard
        label="Service window"
        value={
          !serviceStarted && startsLabel
            ? `Opens ${startsLabel}`
            : expiresLabel
              ? `Active · until ${expiresLabel}`
              : 'Active'
        }
        icon={
          serviceStarted ? (
            <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
          ) : (
            <Clock className="h-3.5 w-3.5 text-amber-600" />
          )
        }
      />
    </div>
  );
}
