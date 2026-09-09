'use client';

import { useCallback, useEffect, useState } from 'react';
import { BellRing, CheckCircle2, Loader2, Plus, X } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  fetchInventoryNotificationSettings,
  updateInventoryNotificationSettings,
} from '@/lib/vmInventoryApi';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Who hears about provider contracts running out.
 *
 * The alert itself is one email covering every VM in the window, so this is a
 * single inventory-wide list rather than a setting per machine.
 */
export function VmInventoryExpiryAlertsModal({ onClose }: { onClose: () => void }) {
  const [emails, setEmails] = useState<string[]>([]);
  const [warningDays, setWarningDays] = useState(2);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetchInventoryNotificationSettings()
      .then((settings) => {
        if (!active) return;
        setEmails(settings.providerExpiryRecipients);
        setWarningDays(settings.warningDays);
      })
      .catch(() => {
        if (active) setError('Could not load the alert recipients.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
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
      const next = await updateInventoryNotificationSettings(emails);
      setEmails(next.providerExpiryRecipients);
      setDirty(false);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the recipients.');
    } finally {
      setSaving(false);
    }
  }, [emails]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <BellRing className="h-5 w-5 text-gray-400" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Contract expiry alerts</h2>
              <p className="mt-0.5 text-sm text-gray-500">
                {loading
                  ? 'Loading…'
                  : `Sent ${warningDays} day${warningDays === 1 ? '' : 's'} before a provider end date`}
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
            One email per batch, with an Excel sheet attached listing every VM whose provider
            contract is about to lapse — IP, username, VM spec, plan duration and expiry date, one
            row per login. Each contract is reported once; extending the end date arms it again.
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading recipients…
            </div>
          ) : (
            <>
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
            Save recipients
          </button>
        </div>
      </div>
    </div>
  );
}
