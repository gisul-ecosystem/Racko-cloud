'use client';

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  Loader2,
  Monitor,
  Pencil,
} from 'lucide-react';
import {
  groupCatalog,
  permissionHelper,
  serviceDescription,
  serviceIcon,
  servicesFromPermissions,
  type RolePermissionDef,
} from './roleWizardMeta';

export type RoleWizardStep = 'info' | 'services' | 'permissions' | 'review';

export type RoleWizardInitial = {
  name: string;
  description: string;
  permissions: string[];
  lockedMeta?: boolean;
};

export type RoleWizardSavePayload = {
  name: string;
  description: string;
  permissions: string[];
};

type Props = {
  catalog: RolePermissionDef[];
  initial: RoleWizardInitial;
  accentColor?: string;
  saving?: boolean;
  error?: string | null;
  onCancel: () => void;
  onSave: (payload: RoleWizardSavePayload) => void | Promise<void>;
};

const STEPS: Array<{ id: RoleWizardStep; label: string }> = [
  { id: 'info', label: 'Role Info' },
  { id: 'services', label: 'Select Services' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'review', label: 'Review' },
];

function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace('#', '').trim();
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  if (full.length !== 6) return `rgba(185, 28, 28, ${alpha})`;
  const n = Number.parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function RoleStepper({
  step,
  accent,
}: {
  step: RoleWizardStep;
  accent: string;
}) {
  const activeIdx = STEPS.findIndex((s) => s.id === step);

  return (
    <div
      className="mb-6 flex flex-wrap items-center justify-center gap-y-2 rounded-2xl px-4 py-3"
      style={{ backgroundColor: hexToRgba(accent, 0.06) }}
    >
      {STEPS.map((s, i) => {
        const isActive = s.id === step;
        const isDone = i < activeIdx;
        return (
          <div key={s.id} className="flex items-center">
            {i > 0 ? (
              <div className="mx-2 flex items-center gap-1.5 sm:mx-3">
                <span
                  className="hidden h-px w-4 border-t border-dashed sm:block sm:w-8"
                  style={{
                    borderColor: i <= activeIdx ? hexToRgba(accent, 0.55) : '#D1D5DB',
                  }}
                />
                <Monitor
                  className="h-3.5 w-3.5"
                  style={{ color: i <= activeIdx ? accent : '#9CA3AF' }}
                />
                <span
                  className="hidden h-px w-4 border-t border-dashed sm:block sm:w-8"
                  style={{
                    borderColor: i <= activeIdx ? hexToRgba(accent, 0.55) : '#D1D5DB',
                  }}
                />
              </div>
            ) : null}
            <span
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                isActive ? 'text-white' : ''
              }`}
              style={
                isActive
                  ? { backgroundColor: accent }
                  : isDone
                    ? { color: accent }
                    : { color: '#6B7280' }
              }
            >
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function AccentCheckbox({
  checked,
  onChange,
  accent,
  ariaLabel,
}: {
  checked: boolean;
  onChange: () => void;
  accent: string;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors"
      style={
        checked
          ? { backgroundColor: accent, borderColor: accent }
          : { borderColor: '#D1D5DB', backgroundColor: '#fff' }
      }
    >
      {checked ? <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} /> : null}
    </button>
  );
}

function AccentToggle({
  checked,
  onChange,
  accent,
  ariaLabel,
}: {
  checked: boolean;
  onChange: () => void;
  accent: string;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onChange}
      className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
      style={{ backgroundColor: checked ? accent : '#D1D5DB' }}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'left-5' : 'left-0.5'
        }`}
      />
    </button>
  );
}

export function RoleWizard({
  catalog,
  initial,
  accentColor = '#B91C1C',
  saving = false,
  error = null,
  onCancel,
  onSave,
}: Props) {
  const accent = accentColor || '#B91C1C';
  const lockedMeta = Boolean(initial.lockedMeta);

  const [step, setStep] = useState<RoleWizardStep>('info');
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [selectedServices, setSelectedServices] = useState<string[]>(() =>
    servicesFromPermissions(catalog, initial.permissions)
  );
  const [permissions, setPermissions] = useState<string[]>([...initial.permissions]);
  const [permTab, setPermTab] = useState(0);

  const byGroup = useMemo(() => groupCatalog(catalog), [catalog]);
  const allServices = useMemo(() => [...byGroup.keys()], [byGroup]);

  const activeService = selectedServices[permTab] ?? selectedServices[0];
  const activePerms = activeService ? byGroup.get(activeService) ?? [] : [];

  function goPermissions(index = 0) {
    setPermTab(Math.max(0, Math.min(index, selectedServices.length - 1)));
    setStep('permissions');
  }

  function toggleService(group: string) {
    const perms = byGroup.get(group) ?? [];
    const keys = perms.map((p) => p.key);
    const isSelected = selectedServices.includes(group);
    if (isSelected) {
      setSelectedServices((prev) => prev.filter((g) => g !== group));
      setPermissions((p) => p.filter((k) => !keys.includes(k)));
    } else {
      setSelectedServices((prev) => [...prev, group]);
    }
  }

  function togglePermission(key: string) {
    setPermissions((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function continueFromInfo() {
    if (!lockedMeta && !name.trim()) return;
    setStep('services');
  }

  function continueFromServices() {
    if (selectedServices.length === 0) return;
    // Drop permissions for deselected services
    const allowed = new Set(
      selectedServices.flatMap((g) => (byGroup.get(g) ?? []).map((p) => p.key))
    );
    setPermissions((prev) => prev.filter((k) => allowed.has(k)));
    goPermissions(0);
  }

  function continueFromPermissions() {
    if (permTab < selectedServices.length - 1) {
      setPermTab((i) => i + 1);
      return;
    }
    setStep('review');
  }

  function backFromPermissions() {
    if (permTab > 0) {
      setPermTab((i) => i - 1);
      return;
    }
    setStep('services');
  }

  const primaryBtn =
    'inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50';
  const secondaryBtn =
    'rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50';

  const selectedPermDefs = catalog.filter((p) => permissions.includes(p.key));
  const highlightPerms = selectedPermDefs.slice(0, 8);

  return (
    <div className="space-y-4">
      <RoleStepper step={step} accent={accent} />

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {step === 'info' ? (
          <div className="p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-gray-900">Role Details</h2>
            <p className="mt-0.5 text-sm text-gray-500">Add basic information about this role.</p>

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Role Name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={lockedMeta}
                  placeholder="e.g Security Auditor"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 disabled:bg-gray-50"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Description (optional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={lockedMeta}
                  rows={4}
                  placeholder="Briefly describe the responsibilities and scope of this role..."
                  className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 disabled:bg-gray-50"
                />
              </div>

              <div
                className="flex gap-3 rounded-xl border-l-4 px-4 py-3 text-sm"
                style={{
                  borderLeftColor: accent,
                  backgroundColor: hexToRgba(accent, 0.08),
                  color: accent,
                }}
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accent }} />
                <p>
                  You&apos;ll select specific service groups and granular permission nodes in the
                  subsequent steps. Role names must be unique within your organization.
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4">
              <button type="button" onClick={onCancel} className={secondaryBtn}>
                Back
              </button>
              <button
                type="button"
                onClick={continueFromInfo}
                disabled={!lockedMeta && !name.trim()}
                className={primaryBtn}
                style={{ backgroundColor: accent }}
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}

        {step === 'services' ? (
          <div className="p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-gray-900">Select Services</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Configure permissions for the selected services.
            </p>

            <div className="mt-6 divide-y divide-gray-100 rounded-xl border border-gray-200">
              {allServices.map((group) => {
                const Icon = serviceIcon(group);
                const checked = selectedServices.includes(group);
                return (
                  <div
                    key={group}
                    className="flex cursor-pointer items-center gap-4 px-4 py-4 hover:bg-gray-50/80"
                    onClick={() => toggleService(group)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleService(group);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: hexToRgba(accent, 0.12) }}
                    >
                      <Icon className="h-5 w-5" style={{ color: accent }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">{group}</p>
                      <p className="text-xs text-gray-500">{serviceDescription(group)}</p>
                    </div>
                    <AccentCheckbox
                      checked={checked}
                      onChange={() => toggleService(group)}
                      accent={accent}
                      ariaLabel={`Select ${group}`}
                    />
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4">
              <button type="button" onClick={() => setStep('info')} className={secondaryBtn}>
                Back
              </button>
              <button
                type="button"
                onClick={continueFromServices}
                disabled={selectedServices.length === 0}
                className={primaryBtn}
                style={{ backgroundColor: accent }}
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}

        {step === 'permissions' ? (
          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Set Permissions</h2>
                <p className="mt-0.5 text-sm text-gray-500">
                  Define exactly what this role can do across your selected services.
                </p>
              </div>
              {selectedServices.length > 0 ? (
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                  Process {permTab + 1} of {selectedServices.length}
                </span>
              ) : null}
            </div>

            <div className="mt-5 flex flex-wrap gap-1 border-b border-gray-200">
              {selectedServices.map((group, i) => {
                const active = i === permTab;
                return (
                  <button
                    key={group}
                    type="button"
                    onClick={() => setPermTab(i)}
                    className="rounded-t-lg px-4 py-2 text-sm font-medium transition-colors"
                    style={
                      active
                        ? {
                            backgroundColor: hexToRgba(accent, 0.1),
                            color: accent,
                            borderBottom: `3px solid ${accent}`,
                            marginBottom: -1,
                          }
                        : { color: '#6B7280' }
                    }
                  >
                    {group}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 space-y-2 rounded-xl border border-gray-200 p-2">
              {activePerms.map((p) => {
                const on = permissions.includes(p.key);
                const useToggle =
                  activeService === 'Billing' || activeService === 'Console';
                return (
                  <div
                    key={p.key}
                    className="flex items-center gap-4 rounded-xl border border-gray-100 bg-white px-4 py-3.5"
                  >
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: hexToRgba(accent, 0.1) }}
                    >
                      {(() => {
                        const Icon = serviceIcon(activeService || p.group);
                        return <Icon className="h-4 w-4" style={{ color: accent }} />;
                      })()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">{p.label}</p>
                      <p className="text-xs text-gray-500">{permissionHelper(p.key, p.label)}</p>
                    </div>
                    {useToggle ? (
                      <AccentToggle
                        checked={on}
                        onChange={() => togglePermission(p.key)}
                        accent={accent}
                        ariaLabel={p.label}
                      />
                    ) : (
                      <AccentCheckbox
                        checked={on}
                        onChange={() => togglePermission(p.key)}
                        accent={accent}
                        ariaLabel={p.label}
                      />
                    )}
                  </div>
                );
              })}
              {activePerms.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-gray-500">
                  No permissions in this service group.
                </p>
              ) : null}
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4">
              <button type="button" onClick={backFromPermissions} className={secondaryBtn}>
                Back
              </button>
              <button
                type="button"
                onClick={continueFromPermissions}
                className={primaryBtn}
                style={{ backgroundColor: accent }}
              >
                {permTab < selectedServices.length - 1 ? (
                  <>
                    Next: {selectedServices[permTab + 1]} <ArrowRight className="h-4 w-4" />
                  </>
                ) : (
                  <>
                    Review &amp; Continue <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        ) : null}

        {step === 'review' ? (
          <div className="p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-gray-900">Review Role</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Verify all configurations before finalizing this access role.
            </p>

            <div className="mt-5 space-y-4">
              <section className="rounded-xl border border-gray-200 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Role Info
                  </p>
                  <button
                    type="button"
                    onClick={() => setStep('info')}
                    className="inline-flex items-center gap-1 text-xs font-medium"
                    style={{ color: accent }}
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                </div>
                <p className="text-sm font-medium text-gray-900">
                  {lockedMeta ? initial.name : name.trim() || 'Untitled role'}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  {(lockedMeta ? initial.description : description).trim() ||
                    'No description provided.'}
                </p>
              </section>

              <section className="rounded-xl border border-gray-200 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Service Access
                  </p>
                  <button
                    type="button"
                    onClick={() => setStep('services')}
                    className="inline-flex items-center gap-1 text-xs font-medium"
                    style={{ color: accent }}
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedServices.map((group) => {
                    const Icon = serviceIcon(group);
                    return (
                      <span
                        key={group}
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                        style={{
                          backgroundColor: hexToRgba(accent, 0.1),
                          color: accent,
                        }}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {group}
                      </span>
                    );
                  })}
                  {selectedServices.length === 0 ? (
                    <p className="text-sm text-gray-500">No services selected.</p>
                  ) : null}
                </div>
              </section>

              <section className="rounded-xl border border-gray-200 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Permission Highlights
                  </p>
                  <button
                    type="button"
                    onClick={() => goPermissions(0)}
                    className="inline-flex items-center gap-1 text-xs font-medium"
                    style={{ color: accent }}
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                </div>
                <div className="divide-y divide-gray-100">
                  {highlightPerms.map((p) => {
                    const Icon = serviceIcon(p.group);
                    return (
                      <div key={p.key} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                          style={{ backgroundColor: hexToRgba(accent, 0.1) }}
                        >
                          <Icon className="h-3.5 w-3.5" style={{ color: accent }} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{p.label}</p>
                          <p className="text-xs text-gray-500">
                            {permissionHelper(p.key, p.label)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {highlightPerms.length === 0 ? (
                    <p className="py-2 text-sm text-gray-500">No permissions selected.</p>
                  ) : null}
                  {selectedPermDefs.length > highlightPerms.length ? (
                    <p className="pt-2 text-xs text-gray-400">
                      +{selectedPermDefs.length - highlightPerms.length} more permissions
                    </p>
                  ) : null}
                </div>
              </section>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={() => goPermissions(Math.max(0, selectedServices.length - 1))}
                className="rounded-lg border bg-white px-3.5 py-2 text-sm font-medium hover:bg-gray-50"
                style={{ borderColor: hexToRgba(accent, 0.35), color: accent }}
              >
                Back
              </button>
              <button
                type="button"
                disabled={saving || (!lockedMeta && !name.trim())}
                onClick={() =>
                  void onSave({
                    name: lockedMeta ? initial.name : name.trim(),
                    description: lockedMeta ? initial.description : description.trim(),
                    permissions,
                  })
                }
                className={primaryBtn}
                style={{ backgroundColor: accent }}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save Role
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
