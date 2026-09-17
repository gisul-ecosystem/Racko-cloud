'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../../context/AuthContext';
import {
  fetchAdminVmTemplates,
  fetchAdminVmTemplateStreamTicket,
  fetchMyVMs,
  createAdminVmTemplate,
  deleteAdminVmTemplate,
  type AdminVmTemplate,
  type AdminVmTemplateBuildStep,
  type IVM,
} from '../../../../lib/vmApi';
import { ApiError } from '../../../../lib/apiClient';
import { getSseGatewayBaseUrl } from '../../../../lib/gatewayUrl';
import { ToastContainer, useToast } from '../../../../components/ui/Toast';
import { ConfirmModal } from '../../../../components/ui/ConfirmModal';
import { TableSkeleton } from '../../../../components/dashboard/LoadingSkeleton';
import { ErrorState } from '../../../../components/dashboard/ErrorState';
import { Layers, Plus, RefreshCw, Trash2, Server, X, Check, AlertCircle, Loader2 } from 'lucide-react';

const STATUS_STYLES: Record<string, string> = {
  ready:    'bg-green-50 text-green-700 border-green-200',
  creating: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  failed:   'bg-red-50 text-red-700 border-red-200',
};

const SSE_MAX_RECONNECT_ATTEMPTS = 8;
const SSE_POLL_INTERVAL_MS = 12_000;

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${STATUS_STYLES[status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
      {status === 'creating' && <Loader2 className="w-3 h-3 animate-spin" />}
      {status === 'ready'    && <Check className="w-3 h-3" />}
      {status === 'failed'   && <AlertCircle className="w-3 h-3" />}
      {status}
    </span>
  );
}

// ─── Build step metro progress ────────────────────────────────────────────────

const BUILD_STEPS: { key: AdminVmTemplateBuildStep; label: string }[] = [
  { key: 'stopping_source', label: 'Stopping source VM' },
  { key: 'cloning',         label: 'Cloning VM' },
  { key: 'starting_source', label: 'Starting source VM' },
  { key: 'converting',      label: 'Converting to template' },
];

function BuildStepProgress({
  buildStep,
  errorMessage,
}: {
  buildStep: AdminVmTemplateBuildStep;
  errorMessage?: string | null;
}) {
  const currentIdx = BUILD_STEPS.findIndex((s) => s.key === buildStep);

  return (
    <div className="flex flex-col gap-1.5 py-1">
      {BUILD_STEPS.map((step, idx) => {
        const isDone = currentIdx > idx;
        const isActive = currentIdx === idx;
        const isFailed = isActive && !!errorMessage;

        return (
          <div key={step.key} className="flex items-center gap-2">
            {/* Step dot */}
            <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border transition-colors ${
              isFailed
                ? 'bg-red-100 border-red-300'
                : isDone
                ? 'bg-green-500 border-green-500'
                : isActive
                ? 'bg-blue-100 border-blue-400'
                : 'bg-gray-100 border-gray-200'
            }`}>
              {isFailed && <AlertCircle className="w-3 h-3 text-red-500" />}
              {!isFailed && isDone && <Check className="w-3 h-3 text-white" />}
              {!isFailed && isActive && <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />}
            </div>
            {/* Label */}
            <span className={`text-xs ${
              isFailed ? 'text-red-600 font-medium' :
              isDone   ? 'text-green-700' :
              isActive ? 'text-blue-700 font-medium' :
              'text-gray-400'
            }`}>
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Create Template Modal ────────────────────────────────────────────────────

interface CreateModalProps {
  vms: IVM[];
  vmsLoading: boolean;
  onClose: () => void;
  onCreated: () => void;
}

function CreateTemplateModal({ vms, vmsLoading, onClose, onCreated }: CreateModalProps) {
  const [selectedVmId, setSelectedVmId] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { addToast } = useToast();

  const eligibleVms = vms.filter(
    (v) => !['creating', 'deleting', 'deleted', 'delete_failed'].includes(v.status)
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedVmId || !name.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await createAdminVmTemplate(selectedVmId, name.trim());
      addToast('success', 'Template creation started. It will be ready in a few minutes.');
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create template.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Create Template</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="px-6 py-5 space-y-4">
          {/* Info notice — shown always so admin is aware before proceeding */}
          <div className="flex gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 leading-relaxed">
              Creating a template will temporarily <span className="font-semibold">shut down your source VM</span> during cloning, then automatically restart it.
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Template name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. windows-base-v1"
              maxLength={120}
              required
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Source VM
            </label>
            {vmsLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading VMs…
              </div>
            ) : eligibleVms.length === 0 ? (
              <p className="text-sm text-gray-400">No eligible VMs found.</p>
            ) : (
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {eligibleVms.map((vm) => (
                  <button
                    key={vm._id}
                    type="button"
                    onClick={() => setSelectedVmId(vm._id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-all ${
                      selectedVmId === vm._id
                        ? 'border-blue-500 bg-blue-50 text-blue-900'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <p className="font-medium">{vm.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      #{vm.vmid} · {vm.node} · {vm.status}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedVmId || !name.trim() || submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Create Template
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminTemplatesPage() {
  const { isAuthenticated } = useAuth();
  const { toasts, addToast, dismiss } = useToast();

  const [templates, setTemplates] = useState<AdminVmTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [vms, setVms] = useState<IVM[]>([]);
  const [vmsLoading, setVmsLoading] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminVmTemplate | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAdminVmTemplates();
      setTemplates(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load templates.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void loadTemplates();
  }, [isAuthenticated, loadTemplates]);

  // Stable key — only changes when the SET of creating templates changes (new one added
  // or one finishes). Does NOT re-run when buildStep changes (that would close/reopen the
  // SSE connection on each step, which is wrong). One persistent connection per template.
  const creatingIds = templates
    .filter((t) => t.status === 'creating')
    .map((t) => t._id)
    .sort()
    .join(',');

  useEffect(() => {
    const creatingTemplates = templates.filter((t) => t.status === 'creating');
    if (creatingTemplates.length === 0) return;

    const cleanups: Array<() => void> = [];

    for (const tpl of creatingTemplates) {
      let source: EventSource | null = null;
      let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
      let pollInterval: ReturnType<typeof setInterval> | null = null;
      let disposed = false;
      let terminal = false;
      let attempt = 0;

      const stopPolling = () => {
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      };

      const startPolling = () => {
        if (pollInterval || disposed || terminal) return;

        pollInterval = setInterval(() => {
          if (disposed || terminal) {
            stopPolling();
            return;
          }

          void fetchAdminVmTemplates()
            .then((data) => {
              if (disposed || terminal) return;

              setTemplates(data);

              const updated = data.find((t) => t._id === tpl._id);
              if (updated && (updated.status === 'ready' || updated.status === 'failed')) {
                terminal = true;
                stopPolling();
                source?.close();
                source = null;
              }
            })
            .catch(() => {
              // ignore transient poll failures
            });
        }, SSE_POLL_INTERVAL_MS);
      };

      const scheduleReconnect = () => {
        if (disposed || terminal) return;

        attempt += 1;
        if (attempt >= SSE_MAX_RECONNECT_ATTEMPTS) {
          startPolling();
          return;
        }

        const delay = Math.min(1000 * 2 ** (attempt - 1), 10_000);
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connect();
        }, delay);
      };

      const connect = () => {
        if (disposed || terminal) return;

        void (async () => {
          try {
            const { streamToken } = await fetchAdminVmTemplateStreamTicket(tpl._id);
            if (disposed || terminal) return;

            const url = `${getSseGatewayBaseUrl()}/api/v1/admin-vm-templates/${tpl._id}/stream?streamToken=${encodeURIComponent(streamToken)}`;

            source = new EventSource(url, { withCredentials: true });

            source.onopen = () => {
              attempt = 0;
              stopPolling();
            };

            source.onmessage = (e: MessageEvent) => {
              try {
                const update = JSON.parse(e.data as string) as {
                  buildStep: AdminVmTemplateBuildStep;
                  status: 'creating' | 'ready' | 'failed';
                  errorMessage?: string;
                };

                setTemplates((prev) =>
                  prev.map((t) =>
                    t._id === tpl._id
                      ? { ...t, buildStep: update.buildStep, status: update.status, errorMessage: update.errorMessage ?? null }
                      : t
                  )
                );

                if (update.status === 'ready' || update.status === 'failed') {
                  terminal = true;
                  stopPolling();
                  source?.close();
                  source = null;
                  void loadTemplates();
                }
              } catch (err) {
                console.error('[SSE][Client] Failed to parse message', { templateId: tpl._id, data: e.data, err });
              }
            };

            source.onerror = () => {
              source?.close();
              source = null;
              scheduleReconnect();
            };
          } catch {
            scheduleReconnect();
          }
        })();
      };

      connect();

      cleanups.push(() => {
        disposed = true;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        stopPolling();
        source?.close();
      });
    }

    return () => {
      cleanups.forEach((fn) => fn());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatingIds]);

  function openCreateModal() {
    setShowCreate(true);
    setVmsLoading(true);
    fetchMyVMs()
      .then(setVms)
      .catch(() => setVms([]))
      .finally(() => setVmsLoading(false));
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await deleteAdminVmTemplate(deleteTarget._id);
      addToast('success', 'Template deleted.');
      setDeleteTarget(null);
      void loadTemplates();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to delete template.');
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div className="max-w-screen-xl">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {showCreate && (
        <CreateTemplateModal
          vms={vms}
          vmsLoading={vmsLoading}
          onClose={() => setShowCreate(false)}
          onCreated={() => void loadTemplates()}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          open
          title="Delete Template"
          description={`Delete "${deleteTarget.name}"? This will also remove the template from Proxmox.`}
          confirmLabel="Delete"
          confirmVariant="danger"
          loading={deleteLoading}
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Templates</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {loading ? 'Loading…' : `${templates.length} template${templates.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void loadTemplates()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Create Template
          </button>
        </div>
      </div>

      {error && !loading && <ErrorState message={error} onRetry={() => void loadTemplates()} />}

      {!error && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">VM Templates</p>
          </div>

          {loading ? (
            <TableSkeleton rows={4} cols={6} />
          ) : templates.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <Layers className="w-7 h-7 text-gray-400" />
              </div>
              <p className="text-gray-600 font-medium">No templates yet</p>
              <p className="text-gray-400 text-sm mt-1">
                Create a template from one of your VMs to reuse it later.
              </p>
              <button
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
              >
                <Plus className="w-4 h-4" />
                Create Template
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Source VM</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Node</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Created</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((tpl, i) => (
                    <tr
                      key={tpl._id}
                      className={`border-b border-gray-50 transition-colors ${i % 2 !== 0 ? 'bg-gray-50/40' : ''}`}
                    >
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-gray-900">{tpl.name}</p>
                        {tpl.proxmoxVmid && (
                          <p className="text-xs text-gray-400 font-mono mt-0.5">#{tpl.proxmoxVmid}</p>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {tpl.status === 'creating' && tpl.buildStep !== null ? (
                          <BuildStepProgress
                            buildStep={tpl.buildStep}
                            errorMessage={tpl.errorMessage}
                          />
                        ) : (
                          <>
                            <StatusBadge status={tpl.status} />
                            {tpl.status === 'failed' && tpl.errorMessage && (
                              <p className="text-xs text-red-500 mt-1 max-w-xs truncate" title={tpl.errorMessage}>
                                {tpl.errorMessage}
                              </p>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                          <Server className="w-3.5 h-3.5 text-gray-400" />
                          {tpl.sourceVmName}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-gray-500">{tpl.node ?? '—'}</td>
                      <td className="px-4 py-3.5 text-xs text-gray-400">
                        {new Date(tpl.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          {tpl.status === 'ready' && tpl.proxmoxVmid !== null && (
                            <Link
                              href={`/dashboard/admin/vms/create?templateId=${tpl.proxmoxVmid}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition"
                            >
                              <Plus className="w-3 h-3" />
                              Create VM
                            </Link>
                          )}
                          <button
                            onClick={() => setDeleteTarget(tpl)}
                            disabled={tpl.status === 'creating'}
                            title={tpl.status === 'creating' ? 'Wait for template to finish creating' : 'Delete template'}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
