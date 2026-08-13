'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Building2, Loader2, Save } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import { useAuth } from '@/context/AuthContext';
import {
  fetchMyOnboardingRequest,
  saveOrganizationProfile,
} from '@/lib/customerOnboardingApi';
import {
  COMPANY_SIZE_OPTIONS,
  DIAL_CODES,
  joinPhone,
  organizationOnboardingSchema,
  splitPhone,
  zodIssuesToFieldErrors,
  type FormFieldErrors,
  type OrganizationOnboardingForm,
} from '@/lib/organizationOnboardingSchema';

const EMPTY_FORM: OrganizationOnboardingForm = {
  contactName: '',
  phone: '',
  companyName: '',
  companyWebsite: '',
  designation: '',
  companySize: '1-10',
  taxId: '',
  registeredAddress: '',
  expectedUsage: '',
  useCase: '',
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-600">{message}</p>;
}

export default function ConsoleProfilePage() {
  const { user } = useAuth();
  const isOrgAdmin = user?.role === 'admin' && user.accountType === 'b2b';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FormFieldErrors>({});
  const [form, setForm] = useState<OrganizationOnboardingForm>(EMPTY_FORM);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [phoneDial, setPhoneDial] = useState('+91');
  const [phoneNational, setPhoneNational] = useState('');

  const load = useCallback(async () => {
    if (!isOrgAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const request = await fetchMyOnboardingRequest();
      if (request) {
        setOrgId(request.orgId ?? null);
        const phoneParts = splitPhone(request.phone);
        setPhoneDial(phoneParts.dialCode);
        setPhoneNational(phoneParts.national);
        setForm({
          contactName: request.contactName ?? '',
          phone: request.phone ?? '',
          companyName: request.companyName ?? '',
          companyWebsite: request.companyWebsite ?? '',
          designation: request.designation ?? '',
          companySize:
            (request.companySize as OrganizationOnboardingForm['companySize']) || '1-10',
          taxId: request.taxId ?? '',
          registeredAddress: request.registeredAddress ?? '',
          expectedUsage: request.expectedUsage ?? '',
          useCase: request.useCase ?? '',
        });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load organization profile.');
    } finally {
      setLoading(false);
    }
  }, [isOrgAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateField<K extends keyof OrganizationOnboardingForm>(
    key: K,
    value: OrganizationOnboardingForm[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setFieldErrors({});

    const phone = joinPhone(phoneDial, phoneNational);
    const parsed = organizationOnboardingSchema.safeParse({
      ...form,
      phone,
    });
    if (!parsed.success) {
      setFieldErrors(zodIssuesToFieldErrors(parsed.error.issues));
      return;
    }

    setSaving(true);
    try {
      const saved = await saveOrganizationProfile(parsed.data);
      setOrgId(saved.orgId ?? null);
      setSuccess('Organization profile saved.');
      setForm(parsed.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save organization profile.');
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  if (!isOrgAdmin) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <Link href="/console" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#B91C1C]">
          <ArrowLeft className="h-3 w-3" /> Back to console
        </Link>
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-gray-900">Profile</h1>
          <p className="mt-2 text-sm text-gray-600">{user.email}</p>
          <p className="mt-1 text-xs text-gray-500">
            Organization details are available for B2B organization admins.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <Link href="/console" className="mb-2 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#B91C1C]">
          <ArrowLeft className="h-3 w-3" /> Back to console
        </Link>
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-[#B91C1C]" />
          <h1 className="text-xl font-bold text-gray-900">Organization profile</h1>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Update your organization details. Changes are saved immediately — no Super Admin review
          required.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Signed in as</p>
            <p className="mt-1 text-sm font-semibold text-gray-900">{user.email}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Organization ID</p>
            <p className="mt-1 break-all text-sm font-semibold text-gray-900">
              {orgId ?? 'Generated after details are saved'}
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading organization profile…
        </div>
      ) : (
        <form onSubmit={(e) => void handleSave(e)} className="space-y-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              {success}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Contact name</label>
              <input
                value={form.contactName}
                onChange={(e) => updateField('contactName', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
              />
              <FieldError message={fieldErrors.contactName} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Designation</label>
              <input
                value={form.designation}
                onChange={(e) => updateField('designation', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
              />
              <FieldError message={fieldErrors.designation} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Phone</label>
              <div className="flex gap-2">
                <select
                  value={phoneDial}
                  onChange={(e) => setPhoneDial(e.target.value)}
                  className="rounded-lg border border-gray-200 px-2 py-2 text-sm"
                >
                  {DIAL_CODES.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.flag} {d.code}
                    </option>
                  ))}
                </select>
                <input
                  value={phoneNational}
                  onChange={(e) => setPhoneNational(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                />
              </div>
              <FieldError message={fieldErrors.phone} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Company name</label>
              <input
                value={form.companyName}
                onChange={(e) => updateField('companyName', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
              />
              <FieldError message={fieldErrors.companyName} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Company website</label>
              <input
                value={form.companyWebsite}
                onChange={(e) => updateField('companyWebsite', e.target.value)}
                placeholder="https://"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
              />
              <FieldError message={fieldErrors.companyWebsite} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Company size</label>
              <select
                value={form.companySize}
                onChange={(e) =>
                  updateField('companySize', e.target.value as OrganizationOnboardingForm['companySize'])
                }
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
              >
                {COMPANY_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.companySize} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Tax / registration ID
              </label>
              <input
                value={form.taxId}
                onChange={(e) => updateField('taxId', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
              />
              <FieldError message={fieldErrors.taxId} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Registered address
              </label>
              <textarea
                value={form.registeredAddress}
                onChange={(e) => updateField('registeredAddress', e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
              />
              <FieldError message={fieldErrors.registeredAddress} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-700">Use cases</label>
              <textarea
                value={form.useCase}
                onChange={(e) => updateField('useCase', e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
              />
              <FieldError message={fieldErrors.useCase} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-700">Expected usage</label>
              <textarea
                value={form.expectedUsage}
                onChange={(e) => updateField('expectedUsage', e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
              />
              <FieldError message={fieldErrors.expectedUsage} />
            </div>
          </div>

          <div className="flex justify-end border-t border-gray-100 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save organization details
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
