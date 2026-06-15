'use client';

import { FolderOpen, Users } from 'lucide-react';
import { RequestStatusBadge } from '../RequestStatusBadge';
import { formatDateTime } from '../../utils/formatters';
import type { OrgAdminResourceGroup } from '../../types/orgAdmin';
import { CostingModeBadge } from './CostingModeBadge';

interface OrgAdminResourceGroupListProps {
  groups: OrgAdminResourceGroup[];
  selectedRequestId: number | null;
  loading: boolean;
  onSelect: (requestId: number) => void;
}

export function OrgAdminResourceGroupList({
  groups,
  selectedRequestId,
  loading,
  onSelect,
}: OrgAdminResourceGroupListProps) {
  if (loading && groups.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-10 text-center shadow-sm">
        <FolderOpen className="mx-auto mb-3 h-8 w-8 text-gray-300" />
        <p className="text-sm font-medium text-gray-900">No resource groups</p>
        <p className="mt-1 text-xs text-gray-500">Provisioned requests will appear here.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">Resource Groups</h2>
        <p className="text-xs text-gray-500">{groups.length} provisioned request(s)</p>
      </div>

      <ul className="max-h-[520px] divide-y divide-gray-50 overflow-y-auto">
        {groups.map((group) => {
          const selected = selectedRequestId === group.requestId;
          const displayRg =
            group.costingMode === 'per_user'
              ? group.resourceGroup || `${group.userCount} user RGs`
              : group.resourceGroup || '—';

          return (
            <li key={group.requestId}>
              <button
                type="button"
                onClick={() => onSelect(group.requestId)}
                className={`w-full px-4 py-3 text-left transition hover:bg-gray-50 ${
                  selected ? 'bg-red-50/70 ring-1 ring-inset ring-[#B91C1C]/20' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">
                      #{group.requestId} · {group.customerEmail}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-xs text-gray-500">{displayRg}</p>
                  </div>
                  <RequestStatusBadge status={group.status} />
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <CostingModeBadge mode={group.costingMode} />
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                    <Users className="h-3 w-3" />
                    {group.userCount}
                  </span>
                  {group.activeSessions > 0 && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">
                      {group.activeSessions} active
                    </span>
                  )}
                </div>

                <p className="mt-1.5 text-[11px] text-gray-400">
                  {group.location || '—'} · {formatDateTime(group.createdAt)}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
