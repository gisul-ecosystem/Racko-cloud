'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Globe, Plus, RefreshCw } from 'lucide-react';
import { useCloudAccentColor } from '@/lib/cloudAccent';
import { hexToRgba, tenantAccentButton } from '@/lib/tenantAccentStyles';
import { fetchProjects, type OrgProject } from '@/lib/projectsApi';
import { fetchTenantProjects } from '@/lib/tenantProjectsApi';
import { useIsTenantPortal } from '@/lib/portalMode';
import { GCP_ROUTES, GCP_SERVICE } from '@/cloud_automation_gcp/constants';

export default function GCPDashboard() {
  const accent = useCloudAccentColor();
  const soft = hexToRgba(accent, 0.1);
  const searchParams = useSearchParams();
  const filterProjectId = searchParams?.get('projectId')?.trim() || null;
  const isTenantPortal = useIsTenantPortal();
  const [project, setProject] = useState<OrgProject | null>(null);

  useEffect(() => {
    if (!filterProjectId) {
      setProject(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = isTenantPortal ? await fetchTenantProjects() : await fetchProjects();
        if (cancelled) return;
        setProject(list.find((p) => p.id === filterProjectId) || null);
      } catch {
        if (!cancelled) setProject(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filterProjectId, isTenantPortal]);

  return (
    <div className="mx-auto w-full max-w-screen-xl space-y-6">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div
          className="h-1"
          style={{
            background: `linear-gradient(90deg, ${accent}, ${hexToRgba(accent, 0.65)}, ${accent})`,
          }}
        />
        <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between lg:p-8">
          <div className="flex items-start gap-4">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ring-1"
              style={{
                backgroundColor: soft,
                color: accent,
                ['--tw-ring-color' as string]: hexToRgba(accent, 0.15),
              }}
            >
              <Globe className="h-7 w-7" />
            </div>
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: accent }}
              >
                Cloud automation
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">
                {GCP_SERVICE.name}
              </h1>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-gray-500">
                {GCP_SERVICE.description}
              </p>
              {filterProjectId ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex max-w-full truncate rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-100">
                    Project · {project?.name || filterProjectId}
                  </span>
                  <Link
                    href={GCP_ROUTES.dashboard}
                    className="text-xs font-semibold text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline"
                  >
                    Clear filter
                  </Link>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
            <button
              type="button"
              disabled
              title="GCP request create is not available yet. Project context is ready for when it ships."
              className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white opacity-60"
              style={tenantAccentButton(accent)}
            >
              <Plus className="h-4 w-4" />
              Create Request
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {['Total Requests', 'Completed', 'Provisioning', 'Expired'].map((label) => (
          <div
            key={label}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <p className="text-2xl font-bold text-gray-900">0</p>
            <p className="mt-1 text-sm text-gray-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">Recent requests</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            Project tags will appear here once GCP lab create is enabled
          </p>
        </div>
        <div className="flex min-h-[18rem] flex-col items-center justify-center px-6 py-14 text-center">
          <div
            className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ring-1"
            style={{
              backgroundColor: soft,
              color: accent,
              ['--tw-ring-color' as string]: hexToRgba(accent, 0.15),
            }}
          >
            <Globe className="h-8 w-8" />
          </div>
          <p className="text-base font-semibold text-gray-900">GCP lab create is coming soon</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
            {filterProjectId
              ? `This page is already scoped to ${project?.name || 'your project'}. When create ships, new requests will be stamped with that project automatically.`
              : 'Open GCP from a project’s Use service button so new labs can be tagged to that project when create is ready.'}
          </p>
        </div>
      </div>
    </div>
  );
}
