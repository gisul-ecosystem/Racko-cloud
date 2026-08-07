'use client';

import { useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  adminCreateOrganization,
  adminSendOrganizationInvite,
} from '@/lib/customerOnboardingApi';
import {
  COMPANY_SIZE_OPTIONS,
  DIAL_CODES,
  joinPhone,
  organizationOnboardingSchema,
  zodIssuesToFieldErrors,
  type FormFieldErrors,
  type OrganizationOnboardingForm,
} from '@/lib/organizationOnboardingSchema';

const emptyOrgForm: OrganizationOnboardingForm = {
  contactName: '',
  phone: '',
  officeNumber: '',
  companyName: '',
  companyWebsite: '',
  designation: '',
  companySize: '1-10',
  taxId: '',
  registeredAddress: '',
  expectedUsage: '',
  useCase: '',
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  /** If set, modal is in "send invite only" mode for an existing org admin. */
  inviteUser?: { id: string; email: string } | null;
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-600">{message}</p>;
}

export function OnboardOrganizationModal({ open, onClose, onCreated, inviteUser = null }: Props) {
  const isInviteOnly = Boolean(inviteUser);

  const [email, setEmail] = useState(inviteUser?.email ?? '');
  const [sendInvite, setSendInvite] = useState(true);
  const [includeOrgDetails, setIncludeOrgDetails] = useState(false);
  const [skipOrgOnboarding, setSkipOrgOnboarding] = useState(false);
  const [orgForm, setOrgForm] = useState<OrganizationOnboardingForm>(emptyOrgForm);
  const [phoneDial, setPhoneDial] = useState('+91');
  const [phoneNational, setPhoneNational] = useState('');
  const [officeDial, setOfficeDial] = useState('+91');
  const [officeNational, setOfficeNational] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FormFieldErrors & { email?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(
    () => (isInviteOnly ? 'Send invite' : 'Onboard organization'),
    [isInviteOnly]
  );

  if (!open) return null;

  function resetAndClose() {
    setEmail(inviteUser?.email ?? '');
    setSendInvite(true);
    setIncludeOrgDetails(false);
    setSkipOrgOnboarding(false);
    setOrgForm(emptyOrgForm);
    setPhoneDial('+91');
    setPhoneNational('');
    setOfficeDial('+91');
    setOfficeNational('');
    setFieldErrors({});
    setError(null);
    onClose();
  }

  function updateOrg<K extends keyof OrganizationOnboardingForm>(
    key: K,
    value: OrganizationOnboardingForm[K]
  ) {
    setOrgForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const nextErrors: FormFieldErrors & { email?: string } = {};
    if (!isInviteOnly) {
      if (!email.trim()) nextErrors.email = 'Email is required';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) nextErrors.email = 'Invalid email';
    }

    let organization: OrganizationOnboardingForm | undefined;
    if (!isInviteOnly && includeOrgDetails && !skipOrgOnboarding) {
      const phone = joinPhone(phoneDial, phoneNational);
      const officeNumber = joinPhone(officeDial, officeNational);
      const parsed = organizationOnboardingSchema.safeParse({
        ...orgForm,
        phone,
        officeNumber,
      });
      if (!parsed.success) {
        Object.assign(nextErrors, zodIssuesToFieldErrors(parsed.error.issues));
      } else {
        organization = parsed.data;
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      if (isInviteOnly && inviteUser) {
        await adminSendOrganizationInvite(inviteUser.id);
      } else {
        await adminCreateOrganization({
          email: email.trim().toLowerCase(),
          sendInvite,
          skipOrgOnboarding,
          organization,
        });
      }
      onCreated();
      resetAndClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Request failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
      <div className="relative w-full max-w-2xl rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {isInviteOnly
                ? 'A new temporary password will be generated and emailed to this organization admin.'
                : 'Create a verified B2B admin. A temporary password is generated and emailed automatically.'}
            </p>
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="max-h-[80vh] space-y-4 overflow-y-auto px-5 py-4">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Admin email</label>
            <input
              type="email"
              value={isInviteOnly ? inviteUser?.email ?? '' : email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isInviteOnly}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100 disabled:bg-gray-50"
              autoComplete="off"
            />
            <FieldError message={fieldErrors.email} />
          </div>

          {!isInviteOnly ? (
            <>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={sendInvite}
                  onChange={(e) => setSendInvite(e.target.checked)}
                  className="rounded border-gray-300 text-[#B91C1C] focus:ring-red-200"
                />
                Send invite email now (includes email + generated password)
              </label>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={includeOrgDetails}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIncludeOrgDetails(checked);
                    if (checked) setSkipOrgOnboarding(false);
                  }}
                  className="rounded border-gray-300 text-[#B91C1C] focus:ring-red-200"
                />
                Add organization details now (optional)
              </label>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={skipOrgOnboarding}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setSkipOrgOnboarding(checked);
                    if (checked) setIncludeOrgDetails(false);
                  }}
                  className="rounded border-gray-300 text-[#B91C1C] focus:ring-red-200"
                />
                Skip organization onboarding form
              </label>

              {includeOrgDetails && !skipOrgOnboarding ? (
                <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50/80 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Contact name
                      </label>
                      <input
                        value={orgForm.contactName}
                        onChange={(e) => updateOrg('contactName', e.target.value)}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                      />
                      <FieldError message={fieldErrors.contactName} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Designation
                      </label>
                      <input
                        value={orgForm.designation}
                        onChange={(e) => updateOrg('designation', e.target.value)}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                      />
                      <FieldError message={fieldErrors.designation} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">Phone</label>
                      <div className="flex gap-2">
                        <select
                          value={phoneDial}
                          onChange={(e) => setPhoneDial(e.target.value)}
                          className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm"
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
                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                        />
                      </div>
                      <FieldError message={fieldErrors.phone} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Office number
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={officeDial}
                          onChange={(e) => setOfficeDial(e.target.value)}
                          className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm"
                        >
                          {DIAL_CODES.map((d) => (
                            <option key={d.code} value={d.code}>
                              {d.flag} {d.code}
                            </option>
                          ))}
                        </select>
                        <input
                          value={officeNational}
                          onChange={(e) => setOfficeNational(e.target.value)}
                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                        />
                      </div>
                      <FieldError message={fieldErrors.officeNumber} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Company name
                      </label>
                      <input
                        value={orgForm.companyName}
                        onChange={(e) => updateOrg('companyName', e.target.value)}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                      />
                      <FieldError message={fieldErrors.companyName} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Company website
                      </label>
                      <input
                        value={orgForm.companyWebsite}
                        onChange={(e) => updateOrg('companyWebsite', e.target.value)}
                        placeholder="https://"
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                      />
                      <FieldError message={fieldErrors.companyWebsite} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Company size
                      </label>
                      <select
                        value={orgForm.companySize}
                        onChange={(e) =>
                          updateOrg('companySize', e.target.value as OrganizationOnboardingForm['companySize'])
                        }
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
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
                        value={orgForm.taxId}
                        onChange={(e) => updateOrg('taxId', e.target.value)}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                      />
                      <FieldError message={fieldErrors.taxId} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Registered address
                      </label>
                      <textarea
                        value={orgForm.registeredAddress}
                        onChange={(e) => updateOrg('registeredAddress', e.target.value)}
                        rows={2}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                      />
                      <FieldError message={fieldErrors.registeredAddress} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Use cases
                      </label>
                      <textarea
                        value={orgForm.useCase}
                        onChange={(e) => updateOrg('useCase', e.target.value)}
                        rows={2}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                      />
                      <FieldError message={fieldErrors.useCase} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-gray-700">
                        Expected usage
                      </label>
                      <textarea
                        value={orgForm.expectedUsage}
                        onChange={(e) => updateOrg('expectedUsage', e.target.value)}
                        rows={2}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                      />
                      <FieldError message={fieldErrors.expectedUsage} />
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={resetAndClose}
              className="rounded-lg border border-gray-200 px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isInviteOnly ? 'Send invite' : 'Create organization admin'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
