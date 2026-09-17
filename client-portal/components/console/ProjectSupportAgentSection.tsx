'use client';

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import type { ProjectSupportAgent } from '@/lib/projectsApi';

interface ProjectSupportAgentSectionProps {
  supportAgent: ProjectSupportAgent | null | undefined;
  canManage: boolean;
  disabled?: boolean;
  onSave: (supportAgentId: string | null) => Promise<void>;
  loadAgents: () => Promise<ProjectSupportAgent[]>;
}

export function ProjectSupportAgentSection({
  supportAgent,
  canManage,
  disabled = false,
  onSave,
  loadAgents,
}: ProjectSupportAgentSectionProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [agents, setAgents] = useState<ProjectSupportAgent[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!showPicker) return;
    setLoadingAgents(true);
    setError(null);
    void loadAgents()
      .then((list) => {
        setAgents(list);
        setSelectedId(supportAgent?.id ?? '');
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Failed to load support agents.');
      })
      .finally(() => {
        setLoadingAgents(false);
      });
  }, [showPicker, loadAgents, supportAgent?.id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(selectedId || null);
      setShowPicker(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update support agent.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-medium text-gray-900">Support Agent</h3>

        {supportAgent ? (
          <div className="mt-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-900">{supportAgent.name}</p>
              <p className="text-xs text-gray-500">{supportAgent.email}</p>
            </div>
            {canManage && !disabled && (
              <button
                type="button"
                onClick={() => setShowPicker(true)}
                className="text-sm font-medium text-[#B91C1C] hover:text-[#991B1B]"
              >
                Change
              </button>
            )}
          </div>
        ) : (
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-sm text-gray-500">No agent assigned</p>
            {canManage && !disabled && (
              <button
                type="button"
                onClick={() => setShowPicker(true)}
                className="text-sm font-medium text-[#B91C1C] hover:text-[#991B1B]"
              >
                Assign
              </button>
            )}
          </div>
        )}
      </div>

      {showPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !saving) setShowPicker(false);
          }}
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Change Support Agent</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  Tickets for this project route to the assigned agent.
                </p>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => setShowPicker(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSave(e)} className="space-y-4 px-5 py-4">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              {loadingAgents ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-[#B91C1C]" />
                </div>
              ) : (
                <div>
                  <label htmlFor="support-agent-select" className="mb-1.5 block text-xs font-medium text-gray-600">
                    Support agent
                  </label>
                  <select
                    id="support-agent-select"
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20"
                  >
                    <option value="">No agent (unassigned)</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name} ({agent.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setShowPicker(false)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || loadingAgents}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#991B1B] disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
