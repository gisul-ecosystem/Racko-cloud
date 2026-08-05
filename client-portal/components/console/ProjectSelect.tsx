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
  required = true,
  portal = 'org',
  seedFromQuery = true,
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
}) {
  const [projects, setProjects] = useState<OrgProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seededRef = useRef(false);
  const createHref =
    portal === 'tenant' ? '/console/dashboard/projects/create' : '/console/projects';

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
  }, [serviceKey, portal]);

  useEffect(() => {
    if (!seedFromQuery || seededRef.current || loading || value) return;
    if (typeof window === 'undefined') return;
    const fromQuery = new URLSearchParams(window.location.search).get('projectId');
    if (fromQuery && projects.some((p) => p.id === fromQuery)) {
      seededRef.current = true;
      onChange(fromQuery);
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

  if (projects.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        No active project has this service enabled.{' '}
        <Link href={createHref} className="font-semibold underline">
          Create a project
        </Link>{' '}
        first.
      </div>
    );
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        Project / client{required ? ' *' : ''}
      </label>
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
    </div>
  );
}
