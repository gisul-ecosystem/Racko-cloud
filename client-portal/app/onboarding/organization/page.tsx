'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/apiClient';
import { useAuth } from '@/context/AuthContext';
import {
  fetchMyOnboardingRequest,
  submitOrganizationRequest,
  type OrganizationAccessRequest,
} from '@/lib/customerOnboardingApi';

export default function OrganizationOnboardingPage() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const [request, setRequest] = useState<OrganizationAccessRequest | null>(null);
  const [loadingRequest, setLoadingRequest] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [form, setForm] = useState({
    contactName: '',
    companyName: '',
    companyWebsite: '',
    phone: '',
    designation: '',
    companySize: '',
    registeredAddress: '',
    taxId: '',
    useCase: '',
    expectedUsage: '',
  });

  useEffect(() => {
    if (isLoading || !user) return;
    if (user.accountType !== 'b2b') {
      router.replace(user.role === 'admin' ? '/console' : '/dashboard/user');
      return;
    }

    void (async () => {
      try {
        const existing = await fetchMyOnboardingRequest();
        setRequest(existing);
        if (existing) {
          setForm({
            contactName: existing.contactName ?? '',
            companyName: existing.companyName ?? '',
            companyWebsite: existing.companyWebsite ?? '',
            phone: existing.phone ?? '',
            designation: existing.designation ?? '',
            companySize: existing.companySize ?? '',
            registeredAddress: existing.registeredAddress ?? '',
            taxId: existing.taxId ?? '',
            useCase: existing.useCase ?? '',
            expectedUsage: existing.expectedUsage ?? '',
          });
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load organization onboarding.');
      } finally {
        setLoadingRequest(false);
      }
    })();
  }, [isLoading, user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const next = await submitOrganizationRequest(form);
      setRequest(next);
      setFlash('Organization request submitted for super admin review.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to submit organization request.');
    } finally {
      setSaving(false);
    }
  }

  if (isLoading || !isAuthenticated || !user || loadingRequest) {
    return <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center text-white">Loading...</div>;
  }

  const status = request?.status ?? 'draft';

  return (
    <div className="min-h-screen bg-[#0a0f1e] px-4 py-10 text-white">
      <div className="mx-auto max-w-3xl rounded-2xl border border-gray-800 bg-[#111827] p-8">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-red-950/30 px-3 py-1 text-xs font-semibold text-[#F87171]">B2B</span>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-wide text-gray-200">
            {status.replace(/_/g, ' ')}
          </span>
        </div>

        <h1 className="text-2xl font-semibold">Organization onboarding</h1>
        <p className="mt-2 text-sm text-gray-300">
          Fill in your company details. The request goes to Super Admin, NDA is handled internally,
          and access is enabled after approval.
        </p>

        {flash ? <div className="mt-4 rounded-lg bg-green-900/30 px-4 py-3 text-sm text-green-300">{flash}</div> : null}
        {error ? <div className="mt-4 rounded-lg bg-red-900/30 px-4 py-3 text-sm text-red-300">{error}</div> : null}

        {request?.status === 'pending' || request?.status === 'approved' ? (
          <div className="mt-6 rounded-xl border border-gray-800 bg-black/20 p-5 text-sm text-gray-300">
            <p>
              <span className="font-semibold text-white">Company:</span> {request.companyName}
            </p>
            <p className="mt-2">
              <span className="font-semibold text-white">NDA status:</span>{' '}
              {request.ndaStatus.replace(/_/g, ' ')}
            </p>
            {request.reviewerNotes ? (
              <p className="mt-2">
                <span className="font-semibold text-white">Reviewer notes:</span> {request.reviewerNotes}
              </p>
            ) : null}
            {request.status === 'approved' ? (
              <button
                type="button"
                onClick={() => router.push('/console')}
                className="mt-4 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white"
              >
                Go to console
              </button>
            ) : (
              <p className="mt-4 text-xs text-gray-400">
                Your request is under review. You can stay on this page and check back later.
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
            {(
              [
                ['contactName', 'Contact name'],
                ['companyName', 'Company name'],
                ['companyWebsite', 'Company website'],
                ['phone', 'Phone'],
                ['designation', 'Designation'],
                ['companySize', 'Company size'],
                ['taxId', 'Tax / registration ID'],
              ] as const
            ).map(([key, label]) => (
              <input
                key={key}
                required={key === 'contactName' || key === 'companyName'}
                value={form[key]}
                onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                placeholder={label}
                className="rounded-lg border border-gray-700 bg-[#0f172a] px-3 py-2 text-sm"
              />
            ))}

            <textarea
              value={form.registeredAddress}
              onChange={(e) => setForm((prev) => ({ ...prev, registeredAddress: e.target.value }))}
              placeholder="Registered address"
              rows={3}
              className="rounded-lg border border-gray-700 bg-[#0f172a] px-3 py-2 text-sm"
            />
            <textarea
              value={form.useCase}
              onChange={(e) => setForm((prev) => ({ ...prev, useCase: e.target.value }))}
              placeholder="Use case"
              rows={3}
              className="rounded-lg border border-gray-700 bg-[#0f172a] px-3 py-2 text-sm"
            />
            <textarea
              value={form.expectedUsage}
              onChange={(e) => setForm((prev) => ({ ...prev, expectedUsage: e.target.value }))}
              placeholder="Expected usage"
              rows={3}
              className="rounded-lg border border-gray-700 bg-[#0f172a] px-3 py-2 text-sm"
            />

            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? 'Submitting...' : 'Submit for super admin review'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
