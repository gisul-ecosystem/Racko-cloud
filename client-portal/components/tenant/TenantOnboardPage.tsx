'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle,
  ChevronLeft,
  Download,
  Loader2,
  Server,
  XCircle,
} from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import { tenantAccentButton } from '@/lib/tenantAccentStyles';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import {
  fetchAvailableTenantVms,
  fetchTenantAssignCounts,
  onboardTenantVms,
} from '@/lib/tenantVmApi';
import type { TenantOnboardResult, TenantVmSummary } from '@/types/tenantPortal';

type PasswordMode = 'auto' | 'shared';
type EmailMode = 'prefix' | 'explicit';

function VmStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    running: 'bg-green-100 text-green-700',
    stopped: 'bg-gray-100 text-gray-600',
    paused: 'bg-yellow-100 text-yellow-700',
    error: 'bg-red-100 text-red-700',
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-500'}`}
    >
      {status}
    </span>
  );
}

function previewNumberedEmails(emailPrefix: string, count: number): string[] {
  const atIdx = emailPrefix.lastIndexOf('@');
  if (atIdx <= 0) return [];
  const local = emailPrefix.slice(0, atIdx);
  const domain = emailPrefix.slice(atIdx);
  return Array.from({ length: count }, (_, i) => `${local}${i + 1}${domain}`);
}

function validateSharedPassword(password: string): string | null {
  if (password.length < 8) return 'At least 8 characters required';
  if (password.length > 128) return 'Maximum 128 characters';
  if (!/[A-Z]/.test(password)) return 'Include an uppercase letter';
  if (!/[a-z]/.test(password)) return 'Include a lowercase letter';
  if (!/[0-9]/.test(password)) return 'Include a digit';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Include a special character';
  return null;
}

function downloadOnboardCsv(result: TenantOnboardResult) {
  const rows = [
    ['VM', 'Email', 'Password', 'Status', 'Error'],
    ...result.pairs.map((p) => [
      p.vmName,
      p.userEmail,
      p.password ?? '',
      p.status,
      p.error ?? '',
    ]),
  ];
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tenant-onboard-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function TenantOnboardPage() {
  const { accentColor } = useTenantBranding();

  const [vms, setVms] = useState<TenantVmSummary[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<TenantOnboardResult | null>(null);

  const [passwordMode, setPasswordMode] = useState<PasswordMode>('auto');
  const [sharedPassword, setSharedPassword] = useState('');
  const [emailMode, setEmailMode] = useState<EmailMode>('prefix');
  const [emailPrefix, setEmailPrefix] = useState('');
  const [explicitEmail, setExplicitEmail] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [available, assignCounts] = await Promise.all([
        fetchAvailableTenantVms(),
        fetchTenantAssignCounts(),
      ]);
      setVms(available.vms);
      setCounts(assignCounts);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load available VMs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedVms = useMemo(
    () => vms.filter((vm) => selectedIds.has(vm.id)),
    [vms, selectedIds]
  );
  const vmCount = selectedIds.size;
  const isSingleVm = vmCount === 1;
  const allSelected = vms.length > 0 && selectedIds.size === vms.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const emailPreview = useMemo(() => {
    if (vmCount === 0) return [];
    if (isSingleVm && emailMode === 'explicit') {
      return explicitEmail ? [explicitEmail] : [];
    }
    return previewNumberedEmails(emailPrefix.trim().toLowerCase(), vmCount);
  }, [vmCount, isSingleVm, emailMode, explicitEmail, emailPrefix]);

  const passwordHint = validateSharedPassword(sharedPassword);
  const canSubmit =
    vmCount > 0 &&
    vmCount <= 50 &&
    emailPreview.length === vmCount &&
    (passwordMode === 'auto' || (sharedPassword.length > 0 && !passwordHint));

  function toggleVm(vmId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(vmId)) next.delete(vmId);
      else if (next.size < 50) next.add(vmId);
      return next;
    });
    setResult(null);
  }

  function toggleAll() {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(vms.slice(0, 50).map((vm) => vm.id)));
    setResult(null);
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const vmIds = selectedVms.map((vm) => vm.id);
      const dto =
        isSingleVm && emailMode === 'explicit'
          ? {
              vmIds,
              email: explicitEmail.trim().toLowerCase(),
              passwordMode,
              ...(passwordMode === 'shared' ? { sharedPassword } : {}),
            }
          : {
              vmIds,
              emailPrefix: emailPrefix.trim().toLowerCase(),
              passwordMode,
              ...(passwordMode === 'shared' ? { sharedPassword } : {}),
            };
      const res = await onboardTenantVms(dto);
      setResult(res);
      setSelectedIds(new Set());
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Onboard failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link
          href="/tenant/dashboard/admin/vms"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to VMs
        </Link>
        <h1 className="text-lg font-semibold text-gray-900">Onboard VMs</h1>
        <p className="mt-1 text-sm text-gray-500">
          Create tenant users and assign one user per selected VM in a single step.
        </p>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-1.5 text-sm text-green-700">
                <CheckCircle className="h-4 w-4" />
                {result.assigned} assigned
              </span>
              {result.failed > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-sm text-red-700">
                  <XCircle className="h-4 w-4" />
                  {result.failed} failed
                </span>
              ) : null}
            </div>
            {result.pairs.some((p) => p.password) ? (
              <button
                type="button"
                onClick={() => downloadOnboardCsv(result)}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Download className="h-4 w-4" />
                Download CSV
              </button>
            ) : null}
          </div>

          {result.pairs.some((p) => p.password) ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Save these credentials now — passwords are shown once and cannot be retrieved later.
            </p>
          ) : null}

          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">VM</th>
                  <th className="px-4 py-3">Email</th>
                  {result.pairs.some((p) => p.password) ? (
                    <th className="px-4 py-3">Password</th>
                  ) : null}
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {result.pairs.map((pair) => (
                  <tr key={pair.vmId} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-3 font-medium text-gray-900">{pair.vmName}</td>
                    <td className="px-4 py-3 text-gray-700">{pair.userEmail}</td>
                    {result.pairs.some((p) => p.password) ? (
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">
                        {pair.password ?? '—'}
                      </td>
                    ) : null}
                    <td className="px-4 py-3">
                      {pair.status === 'assigned' ? (
                        <span className="text-xs font-medium text-green-700">Assigned</span>
                      ) : (
                        <span className="text-xs text-red-600" title={pair.error}>
                          Failed{pair.error ? `: ${pair.error}` : ''}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setResult(null)}
              className="text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              Onboard more VMs
            </button>
            <Link href="/tenant/dashboard/admin/users" className="text-sm font-medium text-[#B91C1C] hover:underline">
              View users
            </Link>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-3">
          <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected;
              }}
              onChange={toggleAll}
              disabled={loading || vms.length === 0}
              className="rounded border-gray-300"
            />
            <span className="font-medium">
              {loading
                ? 'Loading…'
                : `Unassigned VMs — ${selectedIds.size} of ${vms.length} selected (max 50)`}
            </span>
          </label>
        </div>
        {loading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : vms.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-400">No unassigned VMs available.</p>
        ) : (
          <ul className="max-h-72 divide-y divide-gray-50 overflow-y-auto">
            {vms.map((vm) => (
              <li key={vm.id}>
                <label className="flex cursor-pointer items-center gap-4 px-5 py-3 transition hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(vm.id)}
                    onChange={() => toggleVm(vm.id)}
                    className="shrink-0 rounded border-gray-300"
                  />
                  <Server className="h-4 w-4 shrink-0 text-gray-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{vm.name}</p>
                    <p className="font-mono text-xs text-gray-400">
                      #{vm.vmid} · {vm.allocatedCpu} vCPU · {vm.allocatedMemoryGb} GB RAM
                    </p>
                  </div>
                  <VmStatusBadge status={vm.status} />
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      {vmCount > 0 ? (
        <div className="space-y-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">User emails</h2>
            {isSingleVm ? (
              <div className="mt-3 flex gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={emailMode === 'prefix'}
                    onChange={() => setEmailMode('prefix')}
                  />
                  Numbered prefix
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={emailMode === 'explicit'}
                    onChange={() => setEmailMode('explicit')}
                  />
                  Explicit email
                </label>
              </div>
            ) : (
              <p className="mt-1 text-xs text-gray-500">
                Multiple VMs use a numbered email prefix (user1@, user2@, …).
              </p>
            )}

            {isSingleVm && emailMode === 'explicit' ? (
              <input
                type="email"
                value={explicitEmail}
                onChange={(e) => setExplicitEmail(e.target.value)}
                placeholder="john@example.com"
                className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            ) : (
              <input
                type="email"
                value={emailPrefix}
                onChange={(e) => setEmailPrefix(e.target.value)}
                placeholder="vmuser@gmail.com"
                className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            )}

            {emailPreview.length > 0 ? (
              <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                <p className="font-medium text-gray-700">Preview</p>
                <ul className="mt-1 space-y-0.5">
                  {emailPreview.map((email, i) => (
                    <li key={email}>
                      {selectedVms[i]?.name ?? `VM ${i + 1}`} → {email}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div>
            <h2 className="text-sm font-semibold text-gray-900">Passwords</h2>
            <div className="mt-3 flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={passwordMode === 'auto'}
                  onChange={() => setPasswordMode('auto')}
                />
                Auto (unique per user)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={passwordMode === 'shared'}
                  onChange={() => setPasswordMode('shared')}
                />
                Shared password
              </label>
            </div>
            {passwordMode === 'shared' ? (
              <div className="mt-3">
                <input
                  type="password"
                  value={sharedPassword}
                  onChange={(e) => setSharedPassword(e.target.value)}
                  placeholder="Shared password"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">
                  8–128 characters, uppercase, lowercase, digit, and special character.
                </p>
                {sharedPassword && passwordHint ? (
                  <p className="mt-1 text-xs text-red-600">{passwordHint}</p>
                ) : null}
              </div>
            ) : null}
          </div>

          {Object.keys(counts).length > 0 ? (
            <p className="text-xs text-gray-400">
              {Object.keys(counts).length} tenant user(s) already have VM assignments.
            </p>
          ) : null}

          <button
            type="button"
            disabled={!canSubmit || submitting}
            onClick={() => void handleSubmit()}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            style={tenantAccentButton(accentColor)}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Onboard {vmCount} VM{vmCount === 1 ? '' : 's'}
          </button>
        </div>
      ) : (
        <p className="text-center text-sm text-gray-400">Select at least one VM to continue.</p>
      )}
    </div>
  );
}
