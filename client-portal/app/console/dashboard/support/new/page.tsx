'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bug, ChevronRight, Loader2, MessageCircle, Server } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import { tenantConsole } from '@/lib/tenantAdminRoutes';
import {
  submitTicket,
  type TenantTicketPriority,
  type TenantTicketType,
} from '@/lib/tenantSupportApi';
import { ToastContainer, useToast } from '@/components/ui/Toast';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import {
  tenantAccentButton,
  tenantAccentFocusRing,
  tenantAccentSelectedBox,
  tenantAccentText,
} from '@/lib/tenantAccentStyles';

const INPUT_CLASS =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent';

const TYPE_OPTIONS: Array<{
  value: TenantTicketType;
  label: string;
  description: string;
  icon: typeof MessageCircle;
}> = [
  {
    value: 'support',
    label: 'Customer Support',
    description: 'General questions, account help, or service issues',
    icon: MessageCircle,
  },
  {
    value: 'bug',
    label: 'Bug Report',
    description: 'Something is broken or not working as expected',
    icon: Bug,
  },
  {
    value: 'vm_request',
    label: 'VM Request',
    description: 'Request a new virtual machine for your team',
    icon: Server,
  },
];

const PRIORITY_OPTIONS: Array<{ value: TenantTicketPriority; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

export default function TenantSubmitSupportTicketPage() {
  const router = useRouter();
  const { accentColor } = useTenantBranding();
  const { toasts, addToast, dismiss } = useToast();
  const focusRing = tenantAccentFocusRing(accentColor);

  const [type, setType] = useState<TenantTicketType>('support');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TenantTicketPriority>('medium');
  const [phone, setPhone] = useState('');
  const [vmCpu, setVmCpu] = useState('');
  const [vmRam, setVmRam] = useState('');
  const [vmStorage, setVmStorage] = useState('');
  const [vmOs, setVmOs] = useState('');
  const [vmPurpose, setVmPurpose] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vmFieldsValid =
    type !== 'vm_request' ||
    (vmCpu.trim() && vmRam.trim() && vmStorage.trim() && vmOs.trim() && vmPurpose.trim());

  const canSubmit = useMemo(
    () =>
      subject.trim().length > 0 &&
      subject.length <= 255 &&
      description.trim().length >= 10 &&
      vmFieldsValid,
    [subject, description, vmFieldsValid]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    try {
      const ticket = await submitTicket({
        type,
        subject: subject.trim(),
        description: description.trim(),
        priority,
        ...(phone.trim() ? { requesterPhone: phone.trim() } : {}),
        ...(type === 'vm_request'
          ? {
              vmCpu: vmCpu.trim(),
              vmRam: vmRam.trim(),
              vmStorage: vmStorage.trim(),
              vmOs: vmOs.trim(),
              vmPurpose: vmPurpose.trim(),
            }
          : {}),
      });
      addToast('success', 'Support request submitted successfully.');
      router.push(`${tenantConsole.supportTicket(ticket._id)}?submitted=1`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to submit request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      <nav className="flex flex-wrap items-center gap-1 text-sm text-gray-500">
        <Link
          href={tenantConsole.supportTickets}
          className="hover:underline"
          style={tenantAccentText(accentColor)}
        >
          Support
        </Link>
        <ChevronRight className="h-4 w-4 text-gray-300" />
        <span className="font-medium text-gray-900">New Request</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Submit a Support Request</h1>
        <p className="mt-1 text-sm text-gray-500">Our team will respond as soon as possible.</p>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
        <fieldset>
          <legend className="mb-3 text-sm font-medium text-gray-900">
            Request type <span className="text-red-500">*</span>
          </legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {TYPE_OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = type === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setType(option.value)}
                  className={`rounded-xl border p-4 text-left transition ${
                    selected ? '' : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                  style={selected ? tenantAccentSelectedBox(accentColor) : undefined}
                >
                  <Icon
                    className="h-5 w-5"
                    style={selected ? tenantAccentText(accentColor) : { color: '#9ca3af' }}
                  />
                  <p className="mt-2 text-sm font-semibold text-gray-900">{option.label}</p>
                  <p className="mt-1 text-xs text-gray-500">{option.description}</p>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">
              Subject <span className="text-red-500">*</span>
            </label>
            <span className="text-xs text-gray-400">{subject.length}/255</span>
          </div>
          <input
            type="text"
            className={INPUT_CLASS}
            style={focusRing}
            maxLength={255}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Brief summary of your request"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Description <span className="text-red-500">*</span>
          </label>
          <textarea
            className={`${INPUT_CLASS} min-h-[140px] resize-y`}
            style={focusRing}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your issue or request in detail (minimum 10 characters)"
            required
            minLength={10}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Priority</label>
          <select
            className={INPUT_CLASS}
            style={focusRing}
            value={priority}
            onChange={(e) => setPriority(e.target.value as TenantTicketPriority)}
          >
            {PRIORITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Contact phone (optional)
          </label>
          <input
            type="tel"
            className={INPUT_CLASS}
            style={focusRing}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91XXXXXXXXXX"
          />
        </div>

        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            type === 'vm_request' ? 'max-h-[520px] opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-5">
            <p className="mb-4 text-sm font-semibold text-gray-900">VM Details</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ['CPU', vmCpu, setVmCpu, '4 vCPU'],
                  ['RAM', vmRam, setVmRam, '8 GB'],
                  ['Storage', vmStorage, setVmStorage, '100 GB SSD'],
                  ['Operating System', vmOs, setVmOs, 'Ubuntu 22.04'],
                ] as const
              ).map(([label, value, setter, placeholder]) => (
                <div key={label} className={label === 'Operating System' ? 'sm:col-span-2' : ''}>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    {label} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className={INPUT_CLASS}
                    style={focusRing}
                    value={value}
                    onChange={(e) => setter(e.target.value)}
                    placeholder={placeholder}
                    required={type === 'vm_request'}
                  />
                </div>
              ))}
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Purpose <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className={INPUT_CLASS}
                  style={focusRing}
                  value={vmPurpose}
                  onChange={(e) => setVmPurpose(e.target.value)}
                  placeholder="Development server for ML workloads"
                  required={type === 'vm_request'}
                />
              </div>
            </div>
          </div>
        </div>

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            style={tenantAccentButton(accentColor)}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Submit Request
          </button>
          <Link
            href={tenantConsole.supportTickets}
            className="text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
