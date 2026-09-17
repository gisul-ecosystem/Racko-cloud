'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Loader2, Plus, UserPlus, Users, X } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  createSupportAgent,
  fetchSupportAgents,
  toggleAgentStatus,
  type SupportAgent,
} from '@/lib/supportApi';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { TableSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { ToastContainer, useToast } from '@/components/ui/Toast';
import { WhiteLabellingEmptyState } from '@/components/super-admin-console/white-labelling/WhiteLabellingEmptyState';

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20';

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function agentDisplayName(agent: SupportAgent): string {
  return agent.name?.trim() || agent.email;
}

interface CreateAgentModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

function CreateAgentModal({ onClose, onSuccess }: CreateAgentModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || password.length < 8) {
      setError('Name, email, and a password of at least 8 characters are required.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await createSupportAgent({
        name: name.trim(),
        email: email.trim(),
        password,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create agent.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Add Support Agent</h3>
            <p className="mt-1 text-sm text-gray-500">
              Creates a platform account with the support_agent role.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Name</label>
            <input
              type="text"
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Smith"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Email</label>
            <input
              type="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="agent@example.com"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Password</label>
            <input
              type="password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              minLength={8}
              required
            />
          </div>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#991B1B] disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create Agent
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SupportAgentsPage() {
  const { toasts, addToast, dismiss } = useToast();
  const [agents, setAgents] = useState<SupportAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<SupportAgent | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchSupportAgents();
      setAgents(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load support agents.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleToggle = async () => {
    if (!toggleTarget) return;
    const nextActive = !toggleTarget.isActive;
    setTogglingId(toggleTarget._id);
    try {
      await toggleAgentStatus(toggleTarget._id, nextActive);
      addToast('success', `Agent ${nextActive ? 'activated' : 'deactivated'}.`);
      setToggleTarget(null);
      await load();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to update agent status.');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-screen-xl space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {showCreateModal ? (
        <CreateAgentModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            addToast('success', 'Agent created successfully.');
            void load();
          }}
        />
      ) : null}

      <ConfirmModal
        open={toggleTarget != null}
        title={toggleTarget?.isActive ? 'Deactivate agent?' : 'Activate agent?'}
        description={
          toggleTarget
            ? toggleTarget.isActive
              ? `${agentDisplayName(toggleTarget)} will no longer receive ticket assignments until reactivated.`
              : `${agentDisplayName(toggleTarget)} will be able to log in and handle tickets again.`
            : ''
        }
        confirmLabel={toggleTarget?.isActive ? 'Deactivate' : 'Activate'}
        confirmVariant={toggleTarget?.isActive ? 'danger' : 'warning'}
        loading={togglingId != null}
        onCancel={() => setToggleTarget(null)}
        onConfirm={() => void handleToggle()}
      />

      <nav className="flex flex-wrap items-center gap-1 text-sm text-gray-500">
        <Link href="/super-admin-console/support" className="hover:text-[#B91C1C] hover:underline">
          Support
        </Link>
        <ChevronRight className="h-4 w-4 text-gray-300" />
        <span className="font-medium text-gray-900">Support Agents</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Support Agents</h1>
          <p className="mt-1 text-sm text-gray-500">Manage platform support agent accounts.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#991B1B]"
        >
          <Plus className="h-4 w-4" />
          Add Agent
        </button>
      </div>

      {loading ? (
        <TableSkeleton rows={5} cols={5} />
      ) : error ? (
        <ErrorState title="Failed to load agents" message={error} onRetry={load} />
      ) : agents.length === 0 ? (
        <WhiteLabellingEmptyState
          icon={Users}
          title="No support agents yet"
          description="Add your first agent to start routing tickets."
          action={
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#991B1B]"
            >
              <UserPlus className="h-4 w-4" />
              Add Agent
            </button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Created
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {agents.map((agent) => (
                  <tr key={agent._id} className="hover:bg-gray-50/80">
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                      {agentDisplayName(agent)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {agent.email}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {agent.isActive ? (
                        <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {formatDate(agent.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={togglingId === agent._id}
                        onClick={() => setToggleTarget(agent)}
                        className={`text-sm font-medium transition disabled:opacity-50 ${
                          agent.isActive
                            ? 'text-red-600 hover:text-red-700'
                            : 'text-[#B91C1C] hover:text-[#991B1B]'
                        }`}
                      >
                        {agent.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
