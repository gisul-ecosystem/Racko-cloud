'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../../../../lib/apiClient';
import { ApiError } from '../../../../lib/apiClient';
import { Package, Plus, Pencil, PowerOff, RefreshCw, X, Check } from 'lucide-react';

interface SoftwareItem {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  version?: string;
  installScript: string;
  estimatedMinutes: number;
  isActive: boolean;
  createdAt: string;
}

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

const inputClass =
  'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-400';
const labelClass = 'block text-xs font-medium text-gray-700 mb-1';

const EMPTY_FORM = {
  name: '',
  description: '',
  version: '',
  installScript: '',
};

type FormState = typeof EMPTY_FORM;

// ─── Modal ────────────────────────────────────────────────────────────────────

function SoftwareModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: SoftwareItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!initial;
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          name: initial.name,
          description: initial.description ?? '',
          version: initial.version ?? '',
          installScript: initial.installScript,
        }
      : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
        ...(form.version.trim() ? { version: form.version.trim() } : {}),
        installScript: form.installScript.trim(),
      };

      if (isEdit) {
        await apiRequest(`/api/v1/software/${initial!._id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiRequest('/api/v1/software', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  const valid =
    form.name.trim().length > 0 &&
    form.installScript.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">
            {isEdit ? 'Edit Software' : 'Add Software'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Google Chrome"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Version <span className="text-gray-400">(optional)</span></label>
              <input
                type="text"
                value={form.version}
                onChange={(e) => set('version', e.target.value)}
                placeholder="latest"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Description <span className="text-gray-400">(optional)</span></label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Chromium-based web browser"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>
              Install Script (PowerShell / Chocolatey) *
            </label>
            <textarea
              value={form.installScript}
              onChange={(e) => set('installScript', e.target.value)}
              rows={6}
              placeholder={`choco install googlechrome -y --no-progress`}
              className={`${inputClass} resize-y font-mono text-xs`}
            />
            <p className="text-xs text-gray-400 mt-1">
              Script runs via QEMU guest agent inside the VM. Use{' '}
              <code className="bg-gray-100 px-1 rounded">choco install &lt;package&gt; -y --no-progress</code>.
              Exit 0 or 3010 = success.
            </p>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={!valid || saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-40"
          >
            {saving && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {isEdit ? 'Save changes' : 'Add software'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SoftwareManagementPage() {
  const [items, setItems] = useState<SoftwareItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SoftwareItem | undefined>(undefined);
  const [deactivating, setDeactivating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<ApiResponse<{ software: SoftwareItem[] }>>(
        '/api/v1/software/all'
      );
      setItems(res.data.software);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load software.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleDeactivate(id: string) {
    setDeactivating(id);
    try {
      await apiRequest(`/api/v1/software/${id}`, { method: 'DELETE' });
      await load();
    } catch {
      // best-effort
    } finally {
      setDeactivating(null);
    }
  }

  function openAdd() {
    setEditing(undefined);
    setModalOpen(true);
  }

  function openEdit(item: SoftwareItem) {
    setEditing(item);
    setModalOpen(true);
  }

  function handleSaved() {
    setModalOpen(false);
    void load();
  }

  const active = items.filter((s) => s.isActive);
  const inactive = items.filter((s) => !s.isActive);

  return (
    <div className="max-w-4xl">
      {modalOpen && (
        <SoftwareModal
          initial={editing}
          onClose={() => setModalOpen(false)}
          onSaved={handleSaved}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Software Catalog</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Manage installable software packages for Windows VMs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add software
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-6">
          {error}
        </div>
      )}

      {/* Active packages */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Package className="w-4 h-4 text-gray-400" />
            Active packages
            <span className="text-xs font-normal text-gray-400">({active.length})</span>
          </p>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : active.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <Package className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm text-gray-500">No software packages yet.</p>
            <button
              onClick={openAdd}
              className="mt-3 text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Add the first one
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Name', 'Version', 'Script preview', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide first:px-6">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {active.map((sw) => (
                <tr key={sw._id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors last:border-0">
                  <td className="px-6 py-3.5">
                    <p className="font-medium text-gray-900">{sw.name}</p>
                    {sw.description && (
                      <p className="text-xs text-gray-400 truncate max-w-[200px]">{sw.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-500">{sw.version ?? '—'}</td>
                  <td className="px-4 py-3.5 text-xs text-gray-400 font-mono truncate max-w-[260px]">
                    {sw.installScript.split('\n')[0]}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => openEdit(sw)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                      >
                        <Pencil className="w-3 h-3" />
                        Edit
                      </button>
                      <button
                        onClick={() => void handleDeactivate(sw._id)}
                        disabled={deactivating === sw._id}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition disabled:opacity-50"
                      >
                        {deactivating === sw._id
                          ? <span className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                          : <PowerOff className="w-3 h-3" />
                        }
                        Deactivate
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Inactive packages */}
      {inactive.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-500 flex items-center gap-2">
              Inactive packages
              <span className="text-xs font-normal text-gray-400">({inactive.length})</span>
            </p>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {inactive.map((sw) => (
                <tr key={sw._id} className="border-b border-gray-50 last:border-0 opacity-60">
                  <td className="px-6 py-3.5">
                    <p className="font-medium text-gray-700">{sw.name}</p>
                    <p className="text-xs text-gray-400 font-mono">{sw.slug}</p>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-400">{sw.version ?? '—'}</td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                      <Check className="w-3 h-3" /> Inactive
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <button
                      onClick={() => openEdit(sw)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                    >
                      <Pencil className="w-3 h-3" />
                      Re-activate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
