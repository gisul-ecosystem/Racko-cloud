'use client';

import { useCallback, useEffect, useState } from 'react';
import { BellRing, CheckCircle2, Loader2, Plus, X } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  fetchInventoryNotificationSettings,
  updateInventoryNotificationSettings,
} from '@/lib/vmInventoryApi';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_WARNING_DAYS = 0;
const MAX_WARNING_DAYS = 30;

const LEAD_PRESETS: Array<{ days: number; label: string; hint: string }> = [
  { days: 0, label: 'Today', hint: 'On the expiry day' },
  { days: 1, label: '1 day before', hint: 'The day before expiry' },
  { days: 2, label: '2 days before', hint: 'Two days before expiry' },
  { days: 3, label: '3 days before', hint: 'Three days before expiry' },
  { days: 7, label: '7 days before', hint: 'One week before expiry' },
];

const PRESET_DAYS = new Set(LEAD_PRESETS.map((p) => p.days));

function warningDaysCaption(days: number): string {
  if (days === 0) return 'Sent on the provider end date';
  if (days === 1) return 'Sent 1 day before a provider end date';
  return `Sent ${days} days before a provider end date`;
}

/**
 * Who hears about provider contracts running out, and how far ahead.
 *
 * The alert itself is one email covering every VM in the window, so this is a
 * single inventory-wide list rather than a setting per machine.
 */
export function VmInventoryExpiryAlertsModal({ onClose }: { onClose: () => void }) {
  const [emails, setEmails] = useState<string[]>([]);
  const [warningDays, setWarningDays] = useState(2);
  const [customDays, setCustomDays] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usingCustom = !PRESET_DAYS.has(warningDays);

  useEffect(() => {
    let active = true;
    void fetchInventoryNotificationSettings()
      .then((settings) => {
        if (!active) return;
        setEmails(settings.providerExpiryRecipients);
        setWarningDays(settings.warningDays);
        if (!PRESET_DAYS.has(settings.warningDays)) {
          setCustomDays(String(settings.warningDays));
        }
      })
      .catch(() => {
        if (active) setError('Could not load the alert settings.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const chooseDays = useCallback((days: number) => {
    setError(null);
    setSaved(false);
    setWarningDays(days);
    setCustomDays('');
    setDirty(true);
  }, []);

  const applyCustomDays = useCallback((raw: string) => {
    setCustomDays(raw);
    const parsed = Number.parseInt(raw, 10);
    if (raw.trim() === '' || !Number.isInteger(parsed)) return;
    if (parsed < MIN_WARNING_DAYS || parsed > MAX_WARNING_DAYS) {
      setError(`Lead time must be between ${MIN_WARNING_DAYS} and ${MAX_WARNING_DAYS} days.`);
      return;
    }
    setError(null);
    setSaved(false);
    setWarningDays(parsed);
    setDirty(true);
  }, []);

  const add = useCallback(() => {
    const value = draft.trim().toLowerCase();
    if (!value) return;
    if (!EMAIL_RE.test(value)) {
      setError(`"${value}" is not a valid email address.`);
      return;
    }
    setError(null);
    setDraft('');
    setSaved(false);
    setEmails((prev) => (prev.includes(value) ? prev : [...prev, value]));
    setDirty(true);
  }, [draft]);

  const remove = useCallback((email: string) => {
    setError(null);
    setSaved(false);
    setEmails((prev) => prev.filter((e) => e !== email));
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const next = await updateInventoryNotificationSettings(emails, warningDays);
      setEmails(next.providerExpiryRecipients);
      setWarningDays(next.warningDays);
      setDirty(false);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the alert settings.');
    } finally {
      setSaving(false);
    }
  }, [emails, warningDays]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <BellRing className="h-5 w-5 text-gray-400" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Contract expiry alerts</h2>
              <p className="mt-0.5 text-sm text-gray-500">
                {loading ? 'Loading…' : warningDaysCaption(warningDays)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600 ring-1 ring-gray-100">
            One email per project: the project name and the resources on it whose
            provider contract is ending. Each resource is reported once per end
            date. Changing when to send can trigger immediately for projects not
            yet mailed.
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading settings…
            </div>
          ) : (
            <>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                  When to send
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {LEAD_PRESETS.map((preset) => {
                    const selected = warningDays === preset.days && !usingCustom;
                    return (
                      <button
                        key={preset.days}
                        type="button"
                        title={preset.hint}
                        onClick={() => chooseDays(preset.days)}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                          selected
                            ? 'bg-[#B91C1C] text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <label
                    htmlFor="custom-warning-days"
                    className="shrink-0 text-xs font-medium text-gray-500"
                  >
                    Custom days
                  </label>
                  <input
                    id="custom-warning-days"
                    type="number"
                    min={MIN_WARNING_DAYS}
                    max={MAX_WARNING_DAYS}
                    inputMode="numeric"
                    value={usingCustom ? customDays || String(warningDays) : customDays}
                    onChange={(e) => applyCustomDays(e.target.value)}
                    placeholder="0–30"
                    className="w-24 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20"
                  />
                  <span className="text-xs text-gray-400">0 = today, 1 = one day before</span>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                  Recipients
                </p>
                {emails.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {emails.map((email) => (
                      <span
                        key={email}
                        className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 py-1 pl-3 pr-1.5 text-xs text-gray-700"
                      >
                        {email}
                        <button
                          type="button"
                          onClick={() => remove(email)}
                          className="rounded-full p-0.5 text-gray-400 transition hover:bg-gray-200 hover:text-gray-600"
                          aria-label={`Remove ${email}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
                    No recipients yet — nobody is told when a contract expires.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      add();
                    }
                  }}
                  placeholder="ops@yourcompany.com"
                  className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20"
                />
                <button
                  type="button"
                  onClick={add}
                  disabled={!draft.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </button>
              </div>

              {error && <p className="text-xs text-rose-600">{error}</p>}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          {saved && !dirty && (
            <span className="mr-auto inline-flex items-center gap-1 text-xs text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Saved
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#991B1B] disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Save settings
          </button>
        </div>
      </div>
    </div>
  );
}
