'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ToastContainer, useToast } from '../../../../components/ui/Toast';
import { ApiError } from '../../../../lib/apiClient';
import { bulkCreateExternalVMs, type CreateExternalVMDto } from '../../../../lib/externalVmApi';
import { ChevronLeft } from 'lucide-react';

const BULK_EXAMPLE = `[
  {
    "name": "Finance VM 01",
    "ip": "10.0.0.10",
    "password": "VmPassword123!",
    "protocol": "rdp",
    "username": "Administrator",
    "vmType": "ROOT"
  }
]`;

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5';

interface BulkEntryRaw {
  name?: string;
  ip?: string;
  ipAddress?: string;
  password?: string;
  protocol?: string;
  username?: string;
  vmType?: string;
}

export default function BulkImportPage() {
  const router = useRouter();
  const { toasts, addToast, dismiss } = useToast();
  const [jsonText, setJsonText] = useState(BULK_EXAMPLE);
  const [submitting, setSubmitting] = useState(false);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setJsonText(String(reader.result ?? ''));
    reader.onerror = () => addToast('error', 'Failed to read file.');
    reader.readAsText(file);
  };

  const handleSubmit = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      addToast('error', 'Invalid JSON. Please check the format.');
      return;
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      addToast('error', 'JSON must be a non-empty array of servers.');
      return;
    }

    const vms: CreateExternalVMDto[] = [];
    for (const raw of parsed as BulkEntryRaw[]) {
      const ip = raw.ipAddress ?? raw.ip;
      const proto = raw.protocol === 'ssh' ? 'ssh' : 'rdp';
      if (!raw.name || !ip || !raw.password) {
        addToast('error', 'Each entry needs at least name, ip, and password.');
        return;
      }
      vms.push({
        name: String(raw.name).trim(),
        ipAddress: String(ip).trim(),
        protocol: proto,
        password: String(raw.password),
        ...(raw.username && { username: String(raw.username).trim() }),
        ...(raw.vmType && { vmType: String(raw.vmType).trim() }),
      });
    }

    setSubmitting(true);
    try {
      const created = await bulkCreateExternalVMs(vms);
      addToast('success', `${created.length} server${created.length !== 1 ? 's' : ''} added.`);
      router.push('/console/elastic-servers');
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to import servers.');
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
      <h1 className="text-2xl font-bold text-gray-900">Bulk Import</h1>
      <p className="mt-0.5 text-sm text-gray-500">
        Upload a .json file or paste an array of servers.
      </p>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Upload .json file</label>
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-red-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-[#B91C1C] hover:file:bg-red-100"
            />
          </div>
          <div>
            <label className={labelClass}>JSON</label>
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              spellCheck={false}
              rows={14}
              className={`${inputClass} font-mono text-xs leading-relaxed`}
            />
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
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#a01717] disabled:opacity-50"
          >
            {submitting && (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            )}
            Add VMs
          </button>
        </div>
      </div>
    </div>
  );
}
