'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Server, CheckCircle, XCircle, Save } from 'lucide-react';
import { fetchAvailableNodes, saveNodeSelection, type ProxmoxNodeOption } from '../../../../lib/proxmoxNodesApi';

export default function NodesPage() {
  const [nodes, setNodes] = useState<ProxmoxNodeOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAvailableNodes();
      setNodes(data);
      setSelected(new Set(data.filter((n) => n.isSelected).map((n) => n.name)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load nodes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await saveNodeSelection(Array.from(selected));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save selection.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Proxmox Nodes</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Select which nodes to use for VM creation and template discovery
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 shadow-sm transition hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Info */}
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
        Checked nodes will be used for VM creation and template loading. Unchecked nodes are ignored.
        If nothing is checked, all online Proxmox nodes are used automatically.
      </div>

      {/* Node list */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Available Nodes</h2>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        )}

        {!loading && nodes.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-gray-400">
            No nodes found in Proxmox cluster.
          </p>
        )}

        {!loading && nodes.length > 0 && (
          <ul className="divide-y divide-gray-50">
            {nodes.map((node) => {
              const isChecked = selected.has(node.name);
              const isOnline = node.status === 'online';
              return (
                <li key={node.name} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50">
                  <input
                    type="checkbox"
                    id={node.name}
                    checked={isChecked}
                    onChange={() => toggle(node.name)}
                    className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-[#B91C1C]"
                  />
                  <label htmlFor={node.name} className="flex flex-1 cursor-pointer items-center gap-3">
                    <Server className="h-5 w-5 text-gray-400" />
                    <span className="font-mono text-sm font-medium text-gray-900">{node.name}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${isOnline ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {isOnline
                        ? <CheckCircle className="h-3 w-3" />
                        : <XCircle className="h-3 w-3" />}
                      {node.status}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      {saved && <p className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">Node selection saved successfully.</p>}

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={() => void handleSave()}
          disabled={saving || loading}
          className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
        >
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving…' : 'Save Selection'}
        </button>
      </div>
    </div>
  );
}
