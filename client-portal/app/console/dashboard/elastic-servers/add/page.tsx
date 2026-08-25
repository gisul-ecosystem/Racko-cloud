'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ToastContainer, useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/apiClient';
import {
  createTenantExternalVM,
  type CreateExternalVMDto,
  type ExternalVMProtocol,
} from '@/lib/tenantExternalVmApi';
import { tenantConsole } from '@/lib/tenantAdminRoutes';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { tenantAccentButton } from '@/lib/tenantAccentStyles';
import { ChevronLeft, Eye, EyeOff } from 'lucide-react';
import { ProjectSelect } from '@/components/console/ProjectSelect';

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[var(--cloud-accent,#B91C1C)] focus:outline-none focus:ring-2 focus:ring-[var(--cloud-accent,#B91C1C)]';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5';

export default function TenantAddServerPage() {
  const router = useRouter();
  const { accentColor } = useTenantBranding();
  const { toasts, addToast, dismiss } = useToast();

  const [name, setName] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [protocol, setProtocol] = useState<ExternalVMProtocol>('rdp');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    !!(name.trim() && ipAddress.trim() && password.trim()) && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const dto: CreateExternalVMDto = {
        name: name.trim(),
        ipAddress: ipAddress.trim(),
        protocol,
        password,
        ...(projectId ? { projectId } : {}),
        ...(username.trim() && { username: username.trim() }),
      };
      await createTenantExternalVM(dto);
      addToast('success', `${dto.name} added.`);
      router.push(tenantConsole.elastic);
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to add server.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
      <Link
        href={tenantConsole.elastic}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-gray-500 transition hover:text-gray-800"
      >
        <ChevronLeft className="h-4 w-4" /> Back to My Servers
      </Link>
      <h1 className="text-2xl font-bold text-gray-900">Add Server</h1>
      <p className="mt-0.5 text-sm text-gray-500">Register an external RDP or SSH host.</p>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Finance VM 01"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>IP Address</label>
            <input
              type="text"
              value={ipAddress}
              onChange={(e) => setIpAddress(e.target.value)}
              placeholder="10.0.0.10"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Protocol</label>
            <select
              value={protocol}
              onChange={(e) => setProtocol(e.target.value as ExternalVMProtocol)}
              className={inputClass}
            >
              <option value="rdp">RDP</option>
              <option value="ssh">SSH</option>
              <option value="vnc">VNC</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>
              Username{protocol === 'vnc' ? ' (not used for VNC)' : ' (optional)'}
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={
                protocol === 'ssh' ? 'root' : protocol === 'vnc' ? '—' : 'Administrator'
              }
              className={inputClass}
              disabled={protocol === 'vnc'}
            />
          </div>
          <div>
            <label className={labelClass}>Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={`${inputClass} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <ProjectSelect
            serviceKey="elastic-servers"
            value={projectId}
            onChange={setProjectId}
            disabled={submitting}
            portal="tenant"
          />
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-gray-100 pt-5">
          <Link
            href={tenantConsole.elastic}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            style={tenantAccentButton(accentColor)}
          >
            {submitting && (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            )}
            Add VM
          </button>
        </div>
      </div>
    </div>
  );
}
