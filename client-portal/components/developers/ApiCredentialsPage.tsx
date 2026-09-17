'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  Plus,
  X,
} from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  API_CREDENTIAL_SCOPES,
  type ApiCredentialListItem,
  type ApiCredentialScope,
  type ApiCredentialUsageSummary,
  type CreateApiCredentialInput,
  type CreateApiCredentialResult,
} from '@/lib/apiCredentialsApi';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { ToastContainer, useToast } from '@/components/ui/Toast';
import {
  RACKO_BRAND_ACCENT,
  tenantAccentButton,
  tenantAccentFocusRing,
  tenantAccentText,
} from '@/lib/tenantAccentStyles';

export type CredentialsPageAccent = {
  color: string;
  primaryButtonClass: string;
  primaryButtonStyle: CSSProperties;
  linkClass: string;
  linkStyle: CSSProperties;
  iconStyle: CSSProperties;
  inputFocusClass: string;
  inputFocusStyle: CSSProperties;
  checkboxAccent: CSSProperties;
};

function buildPageAccent(accentColor?: string | null): CredentialsPageAccent {
  const color = accentColor?.trim() || RACKO_BRAND_ACCENT;

  return {
    color,
    primaryButtonClass:
      'inline-flex items-center justify-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg shadow-sm transition hover:opacity-90 disabled:opacity-50',
    primaryButtonStyle: tenantAccentButton(color),
    linkClass: 'inline-flex items-center gap-0.5 hover:underline font-medium',
    linkStyle: tenantAccentText(color),
    iconStyle: tenantAccentText(color),
    inputFocusClass: 'focus:outline-none focus:ring-2',
    inputFocusStyle: tenantAccentFocusRing(color),
    checkboxAccent: { accentColor: color },
  };
}

export interface ApiCredentialsClient {
  list: () => Promise<ApiCredentialListItem[]>;
  create: (input: CreateApiCredentialInput) => Promise<CreateApiCredentialResult>;
  revoke: (id: string) => Promise<ApiCredentialListItem>;
  usage: (id: string) => Promise<ApiCredentialUsageSummary>;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

async function copyText(value: string, label: string, addToast: (t: 'success' | 'error', m: string) => void) {
  try {
    await navigator.clipboard.writeText(value);
    addToast('success', `${label} copied to clipboard.`);
  } catch {
    addToast('error', `Could not copy ${label.toLowerCase()}.`);
  }
}

function ScopeChips({ scopes }: { scopes: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {scopes.map((scope) => (
        <span
          key={scope}
          className="inline-flex px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 text-xs font-medium"
        >
          {scope}
        </span>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: ApiCredentialListItem['status'] }) {
  const active = status === 'active';
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
        active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
      }`}
    >
      {active ? 'Active' : 'Revoked'}
    </span>
  );
}

interface CreateCredentialModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (result: CreateApiCredentialResult) => void;
  client: ApiCredentialsClient;
  accent: CredentialsPageAccent;
}

function CreateCredentialModal({ open, onClose, onCreated, client, accent }: CreateCredentialModalProps) {
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<Set<ApiCredentialScope>>(
    () => new Set(API_CREDENTIAL_SCOPES)
  );
  const [rateLimit, setRateLimit] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName('');
    setScopes(new Set(API_CREDENTIAL_SCOPES));
    setRateLimit('');
    setError('');
  }, [open]);

  if (!open) return null;

  function toggleScope(scope: ApiCredentialScope) {
    setScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (scopes.size === 0) {
      setError('Select at least one scope.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const rateLimitPerMin = rateLimit.trim() ? Number(rateLimit) : undefined;
      const result = await client.create({
        name: name.trim(),
        scopes: Array.from(scopes),
        ...(rateLimitPerMin !== undefined && Number.isFinite(rateLimitPerMin)
          ? { rateLimitPerMin }
          : {}),
      });
      onCreated(result);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to create credential.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Create API credential</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="px-6 py-5 space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              required
              placeholder="e.g. Production monitoring"
              className={`w-full px-3 py-2 text-sm border border-gray-200 rounded-lg ${accent.inputFocusClass}`}
              style={accent.inputFocusStyle}
            />
          </div>

          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">Scopes</p>
            <div className="space-y-2">
              {API_CREDENTIAL_SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scopes.has(scope)}
                    onChange={() => toggleScope(scope)}
                    className="rounded border-gray-300"
                    style={accent.checkboxAccent}
                  />
                  <code className="text-xs bg-gray-50 px-1.5 py-0.5 rounded">{scope}</code>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Rate limit (requests / minute, optional)
            </label>
            <input
              type="number"
              min={1}
              max={10000}
              value={rateLimit}
              onChange={(e) => setRateLimit(e.target.value)}
              placeholder="Default (120)"
              className={`w-full px-3 py-2 text-sm border border-gray-200 rounded-lg ${accent.inputFocusClass}`}
              style={accent.inputFocusStyle}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={accent.primaryButtonClass}
              style={accent.primaryButtonStyle}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface SecretRevealModalProps {
  reveal: CreateApiCredentialResult | null;
  onAcknowledge: () => void;
  addToast: (t: 'success' | 'error', m: string) => void;
  accent: CredentialsPageAccent;
}

function SecretRevealModal({ reveal, onAcknowledge, addToast, accent }: SecretRevealModalProps) {
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (reveal) setConfirmed(false);
  }, [reveal]);

  if (!reveal) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg border border-amber-200">
        <div className="px-6 py-4 border-b border-amber-100 bg-amber-50 rounded-t-xl">
          <h2 className="text-base font-semibold text-amber-900">Save your client secret</h2>
          <p className="text-sm text-amber-800 mt-1">
            This secret is shown once and cannot be retrieved again. Store it now.
          </p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <SecretField
            label="Client ID"
            value={reveal.credential.clientId}
            onCopy={() => void copyText(reveal.credential.clientId, 'Client ID', addToast)}
          />
          <SecretField
            label="Client secret"
            value={reveal.clientSecret}
            onCopy={() => void copyText(reveal.clientSecret, 'Client secret', addToast)}
            mono
          />

          <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 rounded border-gray-300"
            />
            I have stored the client secret in a secure location.
          </label>

          <button
            type="button"
            disabled={!confirmed}
            onClick={onAcknowledge}
            className="w-full py-2.5 text-sm font-medium text-white rounded-lg hover:opacity-90 disabled:opacity-40"
            style={accent.primaryButtonStyle}
          >
            Close — secret will not be shown again
          </button>
        </div>
      </div>
    </div>
  );
}

function SecretField({
  label,
  value,
  onCopy,
  mono,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-600 mb-1">{label}</p>
      <div className="flex gap-2">
        <code
          className={`flex-1 text-xs break-all px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg ${
            mono ? 'font-mono' : ''
          }`}
        >
          {value}
        </code>
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
          title={`Copy ${label}`}
        >
          <Copy className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function UsageDrawer({
  open,
  credential,
  onClose,
  client,
}: {
  open: boolean;
  credential: ApiCredentialListItem | null;
  onClose: () => void;
  client: ApiCredentialsClient;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<ApiCredentialUsageSummary | null>(null);

  useEffect(() => {
    if (!open || !credential) {
      setUsage(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void client
      .usage(credential.id)
      .then((data) => {
        if (!cancelled) setUsage(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Failed to load usage.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, credential, client]);

  if (!open || !credential) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-md bg-white shadow-xl h-full overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Usage</h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[280px]">{credential.name}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 flex-1">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          )}
          {error && (
            <div className="flex gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          {usage && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Last used" value={formatDate(usage.lastUsedAt)} />
                <StatCard
                  label={`Requests (${usage.windowHours}h)`}
                  value={String(usage.requestCountInWindow)}
                />
              </div>

              {Object.keys(usage.statusCountsInWindow).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">Status breakdown</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(usage.statusCountsInWindow).map(([code, count]) => (
                      <span
                        key={code}
                        className="text-xs px-2 py-1 rounded-md bg-gray-100 text-gray-700"
                      >
                        {code}: {count}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">Recent calls</p>
                {usage.recentCalls.length === 0 ? (
                  <p className="text-sm text-gray-400">No API calls recorded yet.</p>
                ) : (
                  <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
                    {usage.recentCalls.map((call, i) => (
                      <li key={`${call.at}-${i}`} className="px-3 py-2 text-xs">
                        <div className="flex justify-between gap-2">
                          <span className="font-medium text-gray-800">
                            {call.method} {call.route}
                          </span>
                          <span className="text-gray-500">{call.statusCode}</span>
                        </div>
                        <p className="text-gray-400 mt-0.5">{formatDate(call.at)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}

interface ApiCredentialsPageProps {
  client: ApiCredentialsClient;
  /** Tenant primary color; platform admin defaults to Racko red (#B91C1C). */
  accentColor?: string | null;
}

export function ApiCredentialsPage({ client, accentColor }: ApiCredentialsPageProps) {
  const accent = useMemo(() => buildPageAccent(accentColor), [accentColor]);
  const { toasts, addToast, dismiss } = useToast();
  const [credentials, setCredentials] = useState<ApiCredentialListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [secretReveal, setSecretReveal] = useState<CreateApiCredentialResult | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiCredentialListItem | null>(null);
  const [revokeLoading, setRevokeLoading] = useState(false);
  const [usageTarget, setUsageTarget] = useState<ApiCredentialListItem | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const list = await client.list();
      setCredentials(list);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load credentials.');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRevokeConfirm() {
    if (!revokeTarget) return;
    setRevokeLoading(true);
    try {
      const updated = await client.revoke(revokeTarget.id);
      setCredentials((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      addToast('success', 'Credential revoked.');
      setRevokeTarget(null);
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to revoke.');
    } finally {
      setRevokeLoading(false);
    }
  }

  return (
    <div className="max-w-screen-xl">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <KeyRound className="w-7 h-7" style={accent.iconStyle} />
            API Credentials
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            OAuth client credentials for the Racko public VPS API — scoped to your account.{' '}
            <Link
              href="/developers/api"
              target="_blank"
              rel="noopener noreferrer"
              className={accent.linkClass}
              style={accent.linkStyle}
            >
              Read the API docs
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className={accent.primaryButtonClass}
          style={accent.primaryButtonStyle}
        >
          <Plus className="w-4 h-4" />
          Create credential
        </button>
      </div>

      {loadError && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {loadError}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-gray-500 text-sm">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading credentials…
          </div>
        ) : credentials.length === 0 ? (
          <div className="text-center py-16 px-6">
            <KeyRound className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-900 font-medium">No API credentials yet</p>
            <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
              Create OAuth client credentials to automate VPS operations via{' '}
              <code className="text-xs bg-gray-100 px-1 rounded">/api/v1/public</code> using scoped
              access tokens.
            </p>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className={`mt-4 ${accent.primaryButtonClass}`}
              style={accent.primaryButtonStyle}
            >
              <Plus className="w-4 h-4" />
              Create credential
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                  <th className="px-6 py-3">Name</th>
                  <th className="px-4 py-3">Client ID</th>
                  <th className="px-4 py-3">Scopes</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Last used</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {credentials.map((cred) => {
                  const revoked = cred.status === 'revoked';
                  return (
                    <tr
                      key={cred.id}
                      className={revoked ? 'bg-gray-50/80 text-gray-500' : 'text-gray-800'}
                    >
                      <td className="px-6 py-4 font-medium">{cred.name}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1 max-w-[200px]">
                          <code className="text-xs truncate">{cred.clientId}</code>
                          <button
                            type="button"
                            onClick={() => void copyText(cred.clientId, 'Client ID', addToast)}
                            className="shrink-0 p-1 text-gray-400 hover:text-gray-600"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-4 min-w-[140px]">
                        <ScopeChips scopes={cred.scopes} />
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge status={cred.status} />
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-xs">
                        {formatDate(cred.createdAt)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-xs">
                        {formatDate(cred.lastUsedAt)}
                      </td>
                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setUsageTarget(cred)}
                          className="text-xs font-medium hover:underline mr-3"
                          style={accent.linkStyle}
                        >
                          View usage
                        </button>
                        {!revoked && (
                          <button
                            type="button"
                            onClick={() => setRevokeTarget(cred)}
                            className="text-xs font-medium text-red-600 hover:underline"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateCredentialModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        client={client}
        accent={accent}
        onCreated={(result) => {
          setCredentials((prev) => [result.credential, ...prev]);
          setSecretReveal(result);
          addToast('success', 'Credential created.');
        }}
      />

      <SecretRevealModal
        reveal={secretReveal}
        onAcknowledge={() => setSecretReveal(null)}
        addToast={addToast}
        accent={accent}
      />

      <UsageDrawer
        open={!!usageTarget}
        credential={usageTarget}
        onClose={() => setUsageTarget(null)}
        client={client}
      />

      <ConfirmModal
        open={!!revokeTarget}
        title="Revoke API credential?"
        description={
          revokeTarget
            ? `Revoke "${revokeTarget.name}" (${revokeTarget.clientId})? Existing tokens will stop working. This cannot be undone.`
            : ''
        }
        confirmLabel="Revoke"
        loading={revokeLoading}
        onConfirm={() => void handleRevokeConfirm()}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  );
}
