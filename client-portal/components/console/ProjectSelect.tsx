'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  fetchProjectsForService,
  type OrgProject,
} from '@/lib/projectsApi';
import { fetchTenantProjectsForService } from '@/lib/tenantProjectsApi';
import type { AdminServiceKey } from '@/lib/adminServicesApi';

export function ProjectSelect({
  serviceKey,
  value,
  onChange,
  disabled,
  required = false,
  portal = 'org',
  seedFromQuery = true,
  onCreateProject,
  refreshKey,
}: {
  serviceKey: AdminServiceKey;
  value: string;
  onChange: (projectId: string) => void;
  disabled?: boolean;
  required?: boolean;
  /** Platform org console vs white-label tenant console */
  portal?: 'org' | 'tenant';
  /** When true, preselect `?projectId=` from the URL once projects load. */
  seedFromQuery?: boolean;
  /** When provided, renders a button that calls this instead of navigating away. */
  onCreateProject?: () => void;
  /** Increment to force the project list to re-fetch. */
  refreshKey?: number;
}) {
  const [projects, setProjects] = useState<OrgProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seededRef = useRef(false);

  // Org: navigate to projects page with ?create=1 so modal auto-opens.
  // Tenant: navigate to the standalone create project page.
  const createHref =
    portal === 'tenant'
      ? '/console/dashboard/projects/create'
      : '/console/projects?create=1';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const list =
          portal === 'tenant'
            ? await fetchTenantProjectsForService(serviceKey)
            : await fetchProjectsForService(serviceKey);
        if (!cancelled) setProjects(list);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Failed to load projects.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [serviceKey, portal, refreshKey]);

  useEffect(() => {
    if (!seedFromQuery || seededRef.current || loading) return;
    if (typeof window === 'undefined') return;
    const fromQuery = new URLSearchParams(window.location.search).get('projectId');
    if (fromQuery && projects.some((p) => p.id === fromQuery)) {
      seededRef.current = true;
      if (!value) onChange(fromQuery);
    }
  }, [seedFromQuery, loading, value, projects, onChange]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading projects…
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1 text-sm font-medium text-gray-700">
          Project / client{required ? ' *' : ''}
        </p>
        <p className="text-xs text-gray-500">
          Assign this resource to a project for spend tracking in Reports.
        </p>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">No active project has this service enabled.</p>
          <p className="mt-1 text-xs text-amber-700">
            Create a project with this service to continue.
          </p>
          {onCreateProject ? (
            <button
              type="button"
              onClick={onCreateProject}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#B91C1C] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#991B1B]"
            >
              + Create new project
            </button>
          ) : (
            <Link
              href={createHref}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#B91C1C] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#991B1B]"
            >
              + Create new project
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={required}
            disabled={disabled}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#B91C1C] focus:outline-none focus:ring-1 focus:ring-[#B91C1C] disabled:bg-gray-50"
          >
            <option value="">Select a project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.clientName}
              </option>
            ))}
          </select>

          {onCreateProject ? (
            <button
              type="button"
              onClick={onCreateProject}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#B91C1C] hover:underline"
            >
              + Create new project
            </button>
          ) : (
            <Link
              href={createHref}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#B91C1C] hover:underline"
            >
              + Create new project
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
