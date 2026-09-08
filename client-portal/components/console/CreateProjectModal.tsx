'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import type { AdminServiceKey } from '@/lib/adminServicesApi';
import { fetchMyAdminServices } from '@/lib/adminServicesApi';
import { isServiceHiddenFromUi } from '@/lib/hiddenServices';
import {
  createProject,
  fetchProjectClientNames,
  previewProjectName,
  PROJECT_SERVICE_LABELS,
  type OrgProject,
} from '@/lib/projectsApi';
import {
  createTenantProject,
  fetchTenantEligibleProjectServices,
  fetchTenantProjectClientNames,
  previewTenantProjectName,
} from '@/lib/tenantProjectsApi';
import { fetchTenantServiceCatalog } from '@/lib/tenantPortalApi';
import { ClientNameCombobox } from '@/components/console/ClientNameCombobox';
import { PROJECT_SERVICE_META } from '@/lib/projectServiceMeta';

const ORG_ACCENT = '#B91C1C';

function parseReminderEmails(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,;\n]+/)
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean)
    ),
  ].slice(0, 10);
}

export function CreateProjectModal({
  open,
  onClose,
  portal,
  preselectedServices = [],
  lockServices = false,
  onCreated,
  accentColor,
}: {
  open: boolean;
  onClose: () => void;
  portal: 'org' | 'tenant';
  preselectedServices?: AdminServiceKey[];
  /** When true, only preselectedServices are enabled (service pick step skipped). */
  lockServices?: boolean;
  onCreated: (project: OrgProject) => void;
  accentColor?: string;
}) {
  const accent = accentColor?.trim() || ORG_ACCENT;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'info' | 'services'>('info');

  const [previewName, setPreviewName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientNames, setClientNames] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reminderEmailsRaw, setReminderEmailsRaw] = useState('');
  const [availableServices, setAvailableServices] = useState<
    { key: AdminServiceKey; label: string }[]
  >([]);
  const [selectedServices, setSelectedServices] = useState<AdminServiceKey[]>([]);

  const lockedServices = useMemo(
    () => preselectedServices.filter(Boolean),
    [preselectedServices]
  );

  useEffect(() => {
    if (!open) return;

    setStep('info');
    setError(null);
    setSaving(false);
    setClientName('');
    setDescription('');
    setStartDate('');
    setEndDate('');
    setReminderEmailsRaw('');
    setSelectedServices(lockServices ? lockedServices : []);

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const loadClientNames =
          portal === 'tenant'
            ? () => fetchTenantProjectClientNames().catch(() => [] as string[])
            : () => fetchProjectClientNames().catch(() => [] as string[]);

        const loadServices = async (): Promise<{ key: AdminServiceKey; label: string }[]> => {
          if (portal === 'tenant') {
            const [services, catalog] = await Promise.all([
              fetchTenantEligibleProjectServices(),
              fetchTenantServiceCatalog().catch(() => [] as Array<{ key: string; label: string }>),
            ]);
            const labels = Object.fromEntries(catalog.map((c) => [c.key, c.label]));
            return services
              .filter(
                (key) =>
                  key !== 'docs' &&
                  key !== 'machine-manager' &&
                  !isServiceHiddenFromUi(key)
              )
              .map((key) => ({
                key,
                label: labels[key] || PROJECT_SERVICE_LABELS[key] || key,
              }));
          }
          const services = await fetchMyAdminServices();
          return services
            .filter(
              (s) =>
                s.status === 'active' &&
                s.serviceKey !== 'docs' &&
                s.serviceKey !== 'machine-manager' &&
                !isServiceHiddenFromUi(s.serviceKey)
            )
            .map((s) => ({
              key: s.serviceKey,
              label: s.label || PROJECT_SERVICE_LABELS[s.serviceKey] || s.serviceKey,
            }));
        };

        const [preview, names, services] = await Promise.all([
          portal === 'tenant' ? previewTenantProjectName() : previewProjectName(),
          loadClientNames(),
          lockServices ? Promise.resolve([]) : loadServices(),
        ]);

        if (cancelled) return;
        setPreviewName(preview.name);
        setProjectName(preview.name);
        setClientNames(names);
        setAvailableServices(services);
        if (!lockServices && lockedServices.length > 0) {
          setSelectedServices(lockedServices);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Failed to load project form.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, portal, lockServices, lockedServices]);

  function handleClose() {
    if (saving) return;
    onClose();
  }

  function continueToServices(event: React.FormEvent) {
    event.preventDefault();
    if (!projectName.trim() || !clientName.trim() || !startDate || !endDate) return;
    if (lockServices) {
      void submitCreate();
      return;
    }
    setError(null);
    setStep('services');
  }

  function toggleService(key: AdminServiceKey) {
    setSelectedServices((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
    );
  }

  async function submitCreate() {
    const services = lockServices ? lockedServices : selectedServices;
    if (services.length === 0) {
      setError('Select at least one service for this project.');
      return;
    }
    if (!clientName.trim() || !startDate || !endDate) {
      setError('Client name, start date, and end date are required.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        clientName: clientName.trim(),
        name: projectName.trim() !== previewName ? projectName.trim() : undefined,
        description: description.trim() || undefined,
        startDate,
        endDate,
        enabledServices: services,
        reminderEmails: parseReminderEmails(reminderEmailsRaw),
        autoArchiveEnabled: true,
      };
      const created =
        portal === 'tenant' ? await createTenantProject(payload) : await createProject(payload);
      onCreated(created);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create project.');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) handleClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: accent }}>
              Create project
            </p>
            <h2 className="mt-1 text-xl font-bold text-gray-900">
              {step === 'services' ? 'Enable services' : 'New project'}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {lockServices
                ? 'Set client, dates, and reminder emails. This project will include the current service.'
                : step === 'services'
                  ? 'Choose which services belong to this project.'
                  : 'Projects organize spend and resources by client or engagement.'}
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={handleClose}
            className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: accent }} />
          </div>
        ) : step === 'info' ? (
          <form onSubmit={(e) => void continueToServices(e)}>
            <div className="max-h-[60vh] space-y-4 overflow-y-auto p-5">
              {error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                    Project name <span className="text-red-500">*</span>
                  </label>
                  <input
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:ring-1"
                    style={{ ['--tw-ring-color' as string]: accent }}
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    required
                    placeholder={previewName || 'Auto-generated'}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                    Client name <span className="text-red-500">*</span>
                  </label>
                  <ClientNameCombobox
                    value={clientName}
                    onChange={setClientName}
                    clientNames={clientNames}
                    required
                    disabled={saving}
                    placeholder="e.g. Acme Corp"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                  Description <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <textarea
                  className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:ring-1"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                  placeholder="Purpose of this engagement…"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                    Start date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    max={endDate || undefined}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                    End date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={startDate || undefined}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                  Reminder emails <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
                  value={reminderEmailsRaw}
                  onChange={(e) => setReminderEmailsRaw(e.target.value)}
                  placeholder="pm@client.com, billing@client.com"
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  We email these addresses one day before the project end date. Separate multiple
                  addresses with commas.
                </p>
              </div>

              {lockServices && lockedServices.length > 0 ? (
                <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  Service:{' '}
                  {lockedServices
                    .map((key) => PROJECT_SERVICE_META[key]?.label || key)
                    .join(', ')}
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 px-6 py-3">
              <button
                type="button"
                disabled={saving}
                onClick={handleClose}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: accent }}
              >
                {lockServices ? (saving ? 'Creating…' : 'Create project') : 'Next · Services'}
              </button>
            </div>
          </form>
        ) : (
          <div>
            <div className="max-h-[60vh] space-y-3 overflow-y-auto p-5">
              {error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}
              {availableServices.map((service) => {
                const selected = selectedServices.includes(service.key);
                const meta = PROJECT_SERVICE_META[service.key];
                return (
                  <button
                    key={service.key}
                    type="button"
                    onClick={() => toggleService(service.key)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      selected ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="text-sm font-semibold text-gray-900">
                      {meta?.label || service.label}
                    </p>
                    {meta?.description ? (
                      <p className="mt-0.5 text-xs text-gray-500">{meta.description}</p>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 px-6 py-3">
              <button
                type="button"
                disabled={saving}
                onClick={() => setStep('info')}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700"
              >
                Back
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void submitCreate()}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: accent }}
              >
                {saving ? 'Creating…' : 'Create project'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
