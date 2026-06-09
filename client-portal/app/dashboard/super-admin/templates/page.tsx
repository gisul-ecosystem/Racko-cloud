'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  fetchTemplateCatalog,
  saveTemplateSelection,
  type ProxmoxTemplate,
} from '../../../../lib/vmApi';
import { ApiError } from '../../../../lib/apiClient';
import { Layers, RefreshCw, Save, Check } from 'lucide-react';

function bytesToGb(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  return Math.round((bytes / 1024 ** 3) * 10) / 10;
}

export default function TemplateCatalogPage() {
  const [templates, setTemplates] = useState<ProxmoxTemplate[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const catalog = await fetchTemplateCatalog();
      setTemplates(catalog.templates);
      setSelected(new Set(catalog.enabledVmids));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load templates.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (vmid: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(vmid)) next.delete(vmid);
      else next.add(vmid);
      return next;
    });
    setSaved(false);
  };

  const toggleAll = () => {
    if (selected.size === templates.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(templates.map((t) => t.vmid)));
    }
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await saveTemplateSelection([...selected]);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save selection.');
    } finally {
      setSaving(false);
    }
  };

  const allSelected = templates.length > 0 && selected.size === templates.length;
  const someSelected = selected.size > 0 && !allSelected;

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Layers className="w-6 h-6 text-blue-500" />
            Select Templates
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Choose which Proxmox templates admins can use when creating VMs.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || loading}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-50"
          >
            {saving ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : saved ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            {saved ? 'Saved' : 'Save selection'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected;
              }}
              onChange={toggleAll}
              disabled={loading || templates.length === 0}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="font-medium">
              {loading ? 'Loading…' : `${selected.size} of ${templates.length} enabled`}
            </span>
          </label>
        </div>

        {loading ? (
          <div className="p-8 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : templates.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">
            No templates found on the cluster. Mark VMs as templates in Proxmox first.
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {templates.map((tpl) => {
              const isOn = selected.has(tpl.vmid);
              return (
                <li key={tpl.vmid}>
                  <label className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50 transition">
                    <input
                      type="checkbox"
                      checked={isOn}
                      onChange={() => toggle(tpl.vmid)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{tpl.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5 font-mono">
                        ID {tpl.vmid} · {tpl.node} · {tpl.cpu} vCPU · {bytesToGb(tpl.memory)} GB RAM ·{' '}
                        {bytesToGb(tpl.maxdisk)} GB disk
                      </p>
                    </div>
                    {isOn && (
                      <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full shrink-0">
                        Enabled
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!loading && templates.length > 0 && selected.size === 0 && (
        <p className="mt-3 text-xs text-amber-600">
          No templates are enabled. Admins will see an empty list on Create VM until you save a selection.
        </p>
      )}
    </div>
  );
}
