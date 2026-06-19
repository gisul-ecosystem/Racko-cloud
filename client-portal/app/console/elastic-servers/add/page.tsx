'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ToastContainer, useToast } from '../../../../components/ui/Toast';
import { ApiError } from '../../../../lib/apiClient';
import { createExternalVM, type CreateExternalVMDto, type ExternalVMProtocol } from '../../../../lib/externalVmApi';
import { ChevronLeft, Eye, EyeOff } from 'lucide-react';

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5';

export default function AddServerPage() {
  const router = useRouter();
  const { toasts, addToast, dismiss } = useToast();

  const [name, setName] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [protocol, setProtocol] = useState<ExternalVMProtocol>('rdp');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = !!(name.trim() && ipAddress.trim() && password.trim()) && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const dto: CreateExternalVMDto = {
        name: name.trim(),
        ipAddress: ipAddress.trim(),
        protocol,
        password,
        ...(username.trim() && { username: username.trim() }),
      };
      await createExternalVM(dto);
      addToast('success', `${dto.name} added.`);
      router.push('/console/elastic-servers');
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to add server.');
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      <Link
        href="/console/elastic-servers"
        className="mb-2 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
      >
        <ChevronLeft className="h-4 w-4" /> Back to My Servers
      </Link>
      <h1 className="text-2xl font-bold text-gray-900">Add Server</h1>
      <p className="mt-0.5 text-sm text-gray-500">
        Connect an external server for browser console access.
      </p>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="space-y-4">
          <div>
            <label className={labelClass}>
              Display name <span className="text-red-500">*</span>
            </label>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Finance VM 01"
            />
          </div>
          <div>
            <label className={labelClass}>
              IP address <span className="text-red-500">*</span>
            </label>
            <input
              className={inputClass}
              value={ipAddress}
              onChange={(e) => setIpAddress(e.target.value)}
              placeholder="10.0.0.10"
            />
          </div>
          <div>
            <label className={labelClass}>Protocol</label>
            <select
              className={inputClass}
              value={protocol}
              onChange={(e) => setProtocol(e.target.value as ExternalVMProtocol)}
            >
              <option value="rdp">RDP</option>
              <option value="ssh">SSH</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Username</label>
            <input
              className={inputClass}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={protocol === 'ssh' ? 'root' : 'Administrator'}
            />
          </div>
          <div>
            <label className={labelClass}>
              VM Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                className={`${inputClass} pr-10`}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-gray-100 pt-5">
          <Link
            href="/console/elastic-servers"
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#a01717] disabled:opacity-50"
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
