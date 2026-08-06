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

type AttributionMode = 'assign' | 'skip';

export function ProjectSelect({
  serviceKey,
  value,
  onChange,
  disabled,
  /** When true, a project must be selected (no skip option). Default optional. */
  required = false,
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
  const [mode, setMode] = useState<AttributionMode>(required ? 'assign' : 'skip');
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
    if (!seedFromQuery || seededRef.current || loading) return;
    if (typeof window === 'undefined') return;
    const fromQuery = new URLSearchParams(window.location.search).get('projectId');
    if (fromQuery && projects.some((p) => p.id === fromQuery)) {
      seededRef.current = true;
      setMode('assign');
      if (!value) onChange(fromQuery);
    }
  }, [seedFromQuery, loading, value, projects, onChange]);

  // Keep mode in sync if parent clears/sets value externally.
  useEffect(() => {
    if (value) {
      setMode('assign');
    } else if (required) {
      setMode('assign');
    }
  }, [value, required]);

  function chooseAssign() {
    setMode('assign');
  }

  function chooseSkip() {
    setMode('skip');
    if (value) onChange('');
  }

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

  const seededProject = value ? projects.find((p) => p.id === value) : undefined;
  const showSkip = !required;

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1 text-sm font-medium text-gray-700">
          Project / client{required ? ' *' : ''}
        </p>
        <p className="text-xs text-gray-500">
          {required
            ? 'Charges stay on your main wallet and are tracked on this project in Reports.'
            : 'Optional. Assign spend to a project for Reports, or continue without one.'}
        </p>
      </div>

      {showSkip ? (
        <div className="space-y-2">
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition ${
              mode === 'assign'
                ? 'border-[#B91C1C] bg-red-50/50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            } ${disabled ? 'pointer-events-none opacity-60' : ''}`}
          >
            <input
              type="radio"
              name={`project-attribution-${serviceKey}`}
              className="mt-1"
              checked={mode === 'assign'}
              disabled={disabled}
              onChange={chooseAssign}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-gray-900">
                Assign to an existing project
              </span>
              <span className="mt-0.5 block text-xs text-gray-500">
                {seededProject
                  ? `Preselected from project: ${seededProject.name}`
                  : 'Pick a project that has this service enabled.'}
              </span>
            </span>
          </label>

          <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition ${
              mode === 'skip'
                ? 'border-[#B91C1C] bg-red-50/50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            } ${disabled ? 'pointer-events-none opacity-60' : ''}`}
          >
            <input
              type="radio"
              name={`project-attribution-${serviceKey}`}
              className="mt-1"
              checked={mode === 'skip'}
              disabled={disabled}
              onChange={chooseSkip}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-gray-900">
                Continue without a project
              </span>
              <span className="mt-0.5 block text-xs text-gray-500">
                Resource is created unassigned. You can still tag it later from Projects if needed.
              </span>
            </span>
          </label>
        </div>
      ) : null}

      {mode === 'assign' ? (
        projects.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            No active project has this service enabled.{' '}
            <Link href={createHref} className="font-semibold underline">
              Create a project
            </Link>
            {showSkip ? ', or choose “Continue without a project”.' : ' first.'}
          </div>
        ) : (
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Existing project
            </label>
            <select
              value={value}
              onChange={(e) => onChange(e.target.value)}
              required={required || mode === 'assign'}
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
        )
      ) : null}

      {mode === 'skip' && !required ? (
        <p className="text-xs text-gray-500">
          This request will show as <span className="font-medium text-gray-700">Unassigned</span> in
          service lists.
        </p>
      ) : null}
    </div>
  );
}
